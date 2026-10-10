$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'p0-env.ps1')
Remove-Item Env:EVIX_MIGRATION_DATABASE_URL -ErrorAction SilentlyContinue
Set-Location (Join-Path $evixRoot 'apps\evi-x-api')
& '.venv\Scripts\python.exe' -m uvicorn evix_api.app:create_app --factory --host 127.0.0.1 --port 8180 --no-access-log
exit $LASTEXITCODE
