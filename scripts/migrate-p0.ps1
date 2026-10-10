$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'p0-env.ps1')
Set-Location (Join-Path $evixRoot 'apps\evi-x-api')
& '.venv\Scripts\python.exe' -m alembic upgrade head
exit $LASTEXITCODE
