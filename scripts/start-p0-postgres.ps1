$ErrorActionPreference = 'Stop'
$evixRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evixPackage = Join-Path $evixRoot '.local\pgsql'
if (-not (Test-Path -LiteralPath (Join-Path $evixPackage 'bin\initdb.exe'))) { throw 'Run scripts/setup-local-postgres.py first, or use deploy/compose.dev.yaml.' }
# EDB initdb uses the Windows ANSI code page for paths. Use an ASCII-only,
# project-specific temporary runtime for synthetic local tests.
$evixRootHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($evixRoot))).Substring(0,12).ToLowerInvariant()
$evixTempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
$evixRuntime = [System.IO.Path]::GetFullPath((Join-Path $evixTempBase ('evix-p0-pg-' + $evixRootHash)))
if (-not $evixRuntime.StartsWith($evixTempBase + '\', [System.StringComparison]::OrdinalIgnoreCase) -or $evixRuntime -match '[^\x00-\x7F]') { throw 'Expected an ASCII project-specific temporary directory' }
New-Item -ItemType Directory -Force -Path $evixRuntime | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $evixRuntime 'pgsql\bin\initdb.exe'))) { Copy-Item -LiteralPath $evixPackage -Destination (Join-Path $evixRuntime 'pgsql') -Recurse }
$evixPg = Join-Path $evixRuntime 'pgsql\bin'
$evixData = Join-Path $evixRuntime 'data'
[System.IO.File]::WriteAllText((Join-Path $evixRoot '.local\postgres-runtime.json'), (@{runtime=$evixRuntime;data=$evixData;classification='synthetic-local-only'} | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
Set-Location $evixRuntime
if (-not (Test-Path -LiteralPath (Join-Path $evixData 'PG_VERSION'))) {
    $evixPasswordFile = Join-Path $evixRuntime 'pg-init-password'
    [System.IO.File]::WriteAllText($evixPasswordFile, 'local-p0-owner-only', [System.Text.UTF8Encoding]::new($false))
    & (Join-Path $evixPg 'initdb.exe') -D $evixData --username=evix_owner --pwfile=$evixPasswordFile --encoding=UTF8 --locale=C --auth-host=scram-sha-256 --auth-local=scram-sha-256
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed' }
}
& (Join-Path $evixPg 'pg_ctl.exe') -D $evixData status
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $evixPg 'pg_ctl.exe') -D $evixData -l (Join-Path $evixRuntime 'postgres.log') -o '-h 127.0.0.1 -p 55432' -w -t 30 start
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed' }
}
$env:PGPASSWORD = 'local-p0-owner-only'
$evixPsql = Join-Path $evixPg 'psql.exe'
$evixInstalledData = & $evixPsql -h 127.0.0.1 -p 55432 -U evix_owner -d postgres -tAc 'SHOW data_directory'
if ($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($evixInstalledData.Trim()) -ne $evixData) { throw 'Port is not this project database' }
$evixExists = & $evixPsql -h 127.0.0.1 -p 55432 -U evix_owner -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='evix_p0'"
if (-not $evixExists) {
    & (Join-Path $evixPg 'createdb.exe') -h 127.0.0.1 -p 55432 -U evix_owner -E UTF8 evix_p0
    if ($LASTEXITCODE -ne 0) { throw 'Creating development database failed' }
    & $evixPsql -h 127.0.0.1 -p 55432 -U evix_owner -d evix_p0 -v ON_ERROR_STOP=1 -f (Join-Path $evixRoot 'deploy\postgres-init.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Creating application role failed' }
}
Remove-Item Env:PGPASSWORD
Write-Output 'Project-local PostgreSQL ready on 127.0.0.1:55432'
