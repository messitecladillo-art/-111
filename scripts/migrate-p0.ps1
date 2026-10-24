$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'p0-env.ps1')
Set-Location (Join-Path $evixRoot 'apps\backend')
& '.venv\Scripts\python.exe' -m alembic upgrade head
exit $LASTEXITCODE
