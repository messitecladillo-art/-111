#!/usr/bin/env python3
"""Check delivery-record integrity. Does not execute commands or certify a UI."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PureWindowsPath
import re
import stat
import sys
import tempfile

PROFILES = {
    'minor': {'requested_change', 'visual_review'},
    'interface': {'build', 'primary_flow', 'responsive', 'visual_review'},
    'interaction': {'build', 'primary_flow', 'responsive', 'visual_review',
                    'failure_recovery', 'input_alternatives', 'motion_preference'},
    'research': {'source_trace', 'scope_accuracy', 'technical_verification'},
    'audit': {'scope_accuracy', 'findings_evidence', 'reproducibility'},
}
STATUSES = {'pass', 'fail', 'not_run', 'not_applicable'}
KINDS = {'screenshot', 'log', 'review', 'source', 'recording', 'artifact'}
SHA = re.compile(r'^[0-9a-f]{64}$')
RESERVED = {'CON', 'PRN', 'AUX', 'NUL'} | {f'{p}{i}' for p in ('COM', 'LPT') for i in range(1, 10)}


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f'duplicate JSON key: {key}')
        value[key] = item
    return value


def canonical_path(path: Path) -> Path:
    try:
        return path.resolve()
    except PermissionError:
        if os.name != 'nt':
            raise
        # Some Windows managed hosts deny GetFinalPathNameByHandle even when
        # stat/read work. Relative entries are separately checked with lstat.
        return Path(os.path.abspath(path))


def safe_path(root: Path, name: str, *, exists: bool = True) -> Path:
    if not isinstance(name, str) or not name or any(ord(c) < 32 for c in name):
        raise ValueError('path must be a nonempty relative string without control characters')
    win = PureWindowsPath(name)
    normalized = name.replace('\\', '/')
    parts = normalized.split('/')
    if win.drive or win.is_absolute() or normalized.startswith('/') or any(
        p in ('', '.', '..') or ':' in p or p.endswith((' ', '.'))
        or p.split('.')[0].upper() in RESERVED for p in parts
    ):
        raise ValueError(f'unsafe relative path: {name}')
    target = root.joinpath(*parts)
    current = root
    for part in parts:
        current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError(f'linked or reparse path is not accepted: {name}')
        if stat.S_ISREG(info.st_mode) and info.st_nlink > 1:
            raise ValueError(f'hardlinked file is not accepted: {name}')
    canonical_path(target).relative_to(root)
    if exists and not target.is_file():
        raise ValueError(f'file not found: {name}')
    return target


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def verify_file(root: Path, item: dict, label: str, *, evidence=False) -> dict:
    expected_keys = {'path', 'sha256', 'kind'} if evidence else {'path', 'sha256'}
    if not isinstance(item, dict) or set(item) != expected_keys:
        raise ValueError(f'{label}: expected fields {sorted(expected_keys)}')
    if not isinstance(item['sha256'], str) or not SHA.fullmatch(item['sha256']):
        raise ValueError(f'{label}: expected lowercase SHA-256')
    path = safe_path(root, item['path'])
    actual = digest(path)
    if actual != item['sha256']:
        raise ValueError(f'{label}: content hash mismatch: {item["path"]}')
    if evidence:
        if item['kind'] not in KINDS:
            raise ValueError(f'{label}: unsupported evidence kind')
        if item['kind'] == 'screenshot':
            with path.open('rb') as stream:
                head = stream.read(16)
            if not (head.startswith(b'\x89PNG\r\n\x1a\n') or head.startswith(b'\xff\xd8\xff')
                    or (head.startswith(b'RIFF') and head[8:12] == b'WEBP')):
                raise ValueError(f'{label}: screenshot has no supported image header')
    return dict(item)


def audit(root: Path, data: dict) -> dict:
    keys = {'schema_version', 'profile', 'scope', 'artifacts', 'checks', 'limitations'}
    if not isinstance(data, dict) or set(data) != keys:
        raise ValueError(f'manifest fields must be {sorted(keys)}')
    if type(data['schema_version']) is not int or data['schema_version'] != 1:
        raise ValueError('schema_version must be integer 1')
    profile = data['profile']
    if not isinstance(profile, str) or profile not in PROFILES:
        raise ValueError('unknown profile')
    if not isinstance(data['scope'], str) or not data['scope'].strip():
        raise ValueError('scope must be nonempty')
    if not isinstance(data['artifacts'], list) or not isinstance(data['checks'], list):
        raise ValueError('artifacts and checks must be lists')
    if not isinstance(data['limitations'], list) or any(
        not isinstance(x, str) or not x.strip() for x in data['limitations']
    ):
        raise ValueError('limitations must be a list of nonempty strings')
    files = [verify_file(root, x, f'artifact {i}') for i, x in enumerate(data['artifacts'])]
    normalized_paths = [x['path'].replace('\\', '/').casefold() for x in files]
    if len(normalized_paths) != len(set(normalized_paths)):
        raise ValueError('duplicate artifact path')
    checked = []
    ids = set()
    for i, check in enumerate(data['checks']):
        if not isinstance(check, dict) or set(check) != {'id', 'status', 'detail', 'evidence'}:
            raise ValueError(f'check {i}: unexpected fields')
        cid = check['id']
        if not isinstance(cid, str) or not cid.strip() or cid in ids:
            raise ValueError(f'check {i}: empty or duplicate id')
        ids.add(cid)
        if not isinstance(check['status'], str) or check['status'] not in STATUSES:
            raise ValueError(f'check {cid}: unknown status')
        if not isinstance(check['detail'], str) or not check['detail'].strip():
            raise ValueError(f'check {cid}: detail/justification is required')
        if not isinstance(check['evidence'], list):
            raise ValueError(f'check {cid}: evidence must be a list')
        proof = [verify_file(root, x, f'check {cid} evidence {j}', evidence=True)
                 for j, x in enumerate(check['evidence'])]
        if check['status'] == 'pass' and not proof:
            raise ValueError(f'check {cid}: pass requires evidence')
        if cid == 'visual_review' and check['status'] == 'pass' and not any(
            x['kind'] == 'screenshot' for x in proof
        ):
            raise ValueError('visual_review pass requires screenshot evidence')
        checked.append({**check, 'evidence': proof})
    missing = sorted(PROFILES[profile] - ids)
    failed = sorted(x['id'] for x in checked if x['status'] == 'fail')
    not_run = sorted(x['id'] for x in checked if x['status'] == 'not_run')
    result = 'blocked' if failed else 'limited' if missing or not_run or not files else 'ready'
    return {'schema_version': 1, 'result': result,
            'meaning': 'record integrity only; no UI, service, or accessibility certification',
            'profile': profile, 'scope': data['scope'], 'missing_checks': missing,
            'failed_checks': failed, 'not_run_checks': not_run,
            'artifacts': files, 'checks': checked, 'limitations': data['limitations']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--manifest', required=True, help='relative to project root')
    parser.add_argument('--out', help='optional output, relative to project root')
    args = parser.parse_args(argv)
    try:
        # Windows managed hosts may deny strict realpath on a readable directory.
        # is_dir and per-component lstat checks still validate access and links.
        root = canonical_path(Path(args.root))
        if not root.is_dir():
            raise ValueError('root must be a directory')
        manifest = safe_path(root, args.manifest)
        if manifest.stat().st_size > 1024 * 1024:
            raise ValueError('manifest exceeds 1 MiB')
        data = json.loads(manifest.read_text(encoding='utf-8-sig'), object_pairs_hook=unique_object)
        report = audit(root, data)
        report['manifest_sha256'] = digest(manifest)
        output = safe_path(root, args.out, exists=False) if args.out else None
        if output and (output == manifest or output in [safe_path(root, x['path'])
                for x in report['artifacts'] + [p for c in report['checks'] for p in c['evidence']]]):
            raise ValueError('out cannot overwrite the manifest, an artifact, or evidence')
        rendered = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
        if output:
            output.parent.mkdir(parents=True, exist_ok=True)
            safe_path(root, args.out, exists=False)
            temp = None
            try:
                with tempfile.NamedTemporaryFile('w', encoding='utf-8', newline='\n',
                        dir=output.parent, delete=False) as stream:
                    temp = Path(stream.name)
                    stream.write(rendered)
                os.replace(temp, output)
            finally:
                if temp and temp.exists():
                    temp.unlink()
        print(rendered, end='')
        return 0 if report['result'] == 'ready' else 1
    except (ValueError, OSError, TypeError, KeyError) as error:
        print(json.dumps({'result': 'invalid', 'error': str(error)}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
