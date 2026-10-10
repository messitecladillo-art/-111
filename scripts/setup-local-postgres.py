"""Download the EDB binary archive linked by postgresql.org; no machine-wide install."""
import hashlib
import json
import zipfile
from pathlib import Path
from urllib.parse import urlsplit
import httpx

root = Path(__file__).resolve().parents[1]
local = root / '.local'
local.mkdir(exist_ok=True)
url = 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616'
archive = local / 'postgresql-17.11-windows.zip'
hosts = {'sbp.enterprisedb.com', 'get.enterprisedb.com'}
with httpx.Client(timeout=httpx.Timeout(120, connect=30), follow_redirects=False) as client:
    for _ in range(5):
        if urlsplit(url).scheme != 'https' or urlsplit(url).hostname not in hosts:
            raise RuntimeError('Unexpected download origin')
        with client.stream('GET', url) as response:
            if response.is_redirect:
                url = str(response.url.join(response.headers['location']))
                continue
            response.raise_for_status()
            total = 0
            with archive.open('wb') as output:
                for chunk in response.iter_bytes(1024 * 1024):
                    total += len(chunk)
                    if total > 800 * 1024 * 1024:
                        raise RuntimeError('Download exceeds configured maximum')
                    output.write(chunk)
                    if total % (32 * 1024 * 1024) == 0:
                        print(f'Downloaded {total // 1024 // 1024} MiB', flush=True)
            break
    else:
        raise RuntimeError('Too many redirects')
with zipfile.ZipFile(archive) as package:
    selected = [entry for entry in package.infolist() if entry.filename.startswith(('pgsql/bin/', 'pgsql/lib/', 'pgsql/share/'))]
    if sum(entry.file_size for entry in selected) > 3 * 1024**3:
        raise RuntimeError('Archive expansion too large')
    for entry in selected:
        (local / entry.filename).resolve().relative_to(local.resolve())
        package.extract(entry, local)
receipt = {'source': url, 'sourcePage': 'https://www.enterprisedb.com/download-postgresql-binaries',
           'archiveSha256': hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest(),
           'files': len(selected), 'bytes': archive.stat().st_size}
(local / 'postgresql-download-receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
print(json.dumps(receipt), flush=True)
