$ErrorActionPreference = 'Stop'
$evixRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evixLocal = Join-Path $evixRoot '.local'
$evixConfig = Join-Path $evixLocal 'p0-env.json'
New-Item -ItemType Directory -Force -Path $evixLocal | Out-Null
if (-not (Test-Path -LiteralPath $evixConfig)) {
    $evixAuth = [byte[]]::new(32)
    $evixVault = [byte[]]::new(32)
    # Use APIs available in both Windows PowerShell 5.1 and PowerShell 7.
    $evixRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $evixRandom.GetBytes($evixAuth)
        $evixRandom.GetBytes($evixVault)
    } finally { $evixRandom.Dispose() }
    $evixValues = @{
        EVIX_MODE = 'local_test'
        EVIX_DATABASE_URL = 'postgresql+psycopg://evix_app:local-p0-app-only@127.0.0.1:55432/evix_p0'
        EVIX_MIGRATION_DATABASE_URL = 'postgresql+psycopg://evix_owner:local-p0-owner-only@127.0.0.1:55432/evix_p0'
        EVIX_ALLOWED_ORIGINS = '["http://127.0.0.1:3180","http://localhost:3180"]'
        EVIX_INVITED_EMAILS = '["owner@example.test","teammate@example.test","review-a@example.test","review-b@example.test","review-c@example.test"]'
        EVIX_AUTH_SECRET = [BitConverter]::ToString($evixAuth).Replace('-', '').ToLowerInvariant()
        EVIX_KEYRING = (@{v1=[BitConverter]::ToString($evixVault).Replace('-', '').ToLowerInvariant()} | ConvertTo-Json -Compress)
        EVIX_ACTIVE_KEY_ID = 'v1'
        EVIX_MAIL_MODE = 'fixture'
        EVIX_PROVIDER_MODE = 'fixture'
        EVIX_MAILBOX_DIR = Join-Path $evixLocal 'mailbox'
        EVIX_COOKIE_NAME = 'evix_session'
    }
    [System.IO.File]::WriteAllText($evixConfig, ($evixValues | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
}
$evixValues = Get-Content -Raw -LiteralPath $evixConfig -Encoding UTF8 | ConvertFrom-Json
foreach ($evixEntry in $evixValues.PSObject.Properties) { [Environment]::SetEnvironmentVariable($evixEntry.Name, [string]$evixEntry.Value, 'Process') }
$env:UV_CACHE_DIR = Join-Path $evixLocal 'uv-cache'
$env:NEXT_TELEMETRY_DISABLED = '1'
