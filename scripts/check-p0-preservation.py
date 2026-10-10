"""Verify every pre-migration source file remains recoverable and accounted for."""
import hashlib
import json
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
run = root / '.collab/runs/20261007-p0'
receipt = json.loads((run / 'baseline-receipt.json').read_text(encoding='utf-8'))
archive = run / 'baseline-source.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == receipt['archiveSha256']
manifest = (run / 'manifest.sha256').read_bytes()
assert hashlib.sha256(manifest).hexdigest() == receipt['manifest']
results = []
with zipfile.ZipFile(archive) as baseline:
    for line in manifest.decode('utf-8-sig').splitlines():
        original_hash, relative = line.split('  ', 1)
        assert hashlib.sha256(baseline.read(relative)).hexdigest() == original_hash, relative
        current = root / relative
        archived = root / relative.replace('apps/evi-x-platform/app/api/', 'apps/evi-x-platform/legacy/cloudflare-api/')
        if current.is_file():
            state = 'unchanged' if hashlib.sha256(current.read_bytes()).hexdigest() == original_hash else 'modified_with_original_backup'
            location = relative
        elif archived != current and archived.is_file():
            assert hashlib.sha256(archived.read_bytes()).hexdigest() == original_hash, relative
            state, location = 'archived_unchanged', archived.relative_to(root).as_posix()
        else:
            raise SystemExit(f'Unaccounted original file: {relative}')
        results.append({'source': relative, 'state': state, 'current': location, 'originalSha256': original_hash})
summary = {state: sum(row['state'] == state for row in results) for state in sorted({row['state'] for row in results})}
report = {'status': 'passed', 'baselineFiles': len(results), 'archiveSha256': receipt['archiveSha256'], 'summary': summary, 'files': results}
(run / 'preservation-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'files'}))
