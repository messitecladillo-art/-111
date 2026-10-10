"""Hash the source tree without dependencies, caches, private state, or coordination logs."""
import hashlib
import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
excluded = {'.git', '.collab', '.local', '.venv', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.pytest_cache', '.ruff_cache', '.wrangler', '.agent'}
rows = []
for folder in ('apps', 'packages', 'scripts', 'deploy', 'docs', 'skill', 'evals', 'corpus-source'):
    for directory, children, filenames in os.walk(root / folder):
        children[:] = [name for name in children if name not in excluded]
        for name in filenames:
            path = Path(directory) / name
            if not name.startswith('.env') and path.suffix not in {'.pyc', '.tsbuildinfo'}:
                rows.append((path.relative_to(root).as_posix(), hashlib.sha256(path.read_bytes()).hexdigest()))
for name in ('package.json', 'package-lock.json', 'README.md', '.gitignore', 'pyproject.toml'):
    path = root / name
    if path.exists():
        rows.append((name, hashlib.sha256(path.read_bytes()).hexdigest()))
data = ''.join(f'{digest}  {name}\n' for name, digest in sorted(rows)).encode('utf-8')
if len(sys.argv) > 1:
    target = (root / sys.argv[1]).resolve()
    target.relative_to(root / '.collab')
    target.write_bytes(data)
print(json.dumps({'files': len(rows), 'sha256': hashlib.sha256(data).hexdigest()}))
