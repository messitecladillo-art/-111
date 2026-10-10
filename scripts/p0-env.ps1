$ErrorActionPreference = 'Stop'
$evixRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evixLocal = Join-Path $evixRoot '.local'
$evixConfig = Join-Path $evixLocal 'p0-env.json'
New-Item -ItemType Directory -Force -Path $evixLocal | Out-Null
if (-not (Test-Path -LiteralPath $evixConfig)) {
    $evixAuth = [byte[]]::new(32)
    $evixVault = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($evixAuth)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($evixVault)
    $evixValues = @{
        EVIX_MODE = 'local_test'
        EVIX_DATABASE_URL = 'postgresql+psycopg://evix_app:local-p0-app-only@127.0.0.1:55432/evix_p0'
        EVIX_MIGRATION_DATABASE_URL = 'postgresql+psycopg://evix_owner:local-p0-owner-only@127.0.0.1:55432/evix_p0'
        EVIX_ALLOWED_ORIGINS = '["http://127.0.0.1:3180","http://localhost:3180"]'
        EVIX_INVITED_EMAILS = '["owner@example.test","teammate@example.test","review-a@example.test","review-b@example.test","review-c@example.test"]'
        EVIX_AUTH_SECRET = [Convert]::ToHexString($evixAuth).ToLowerInvariant()
        EVIX_KEYRING = (@{v1=[Convert]::ToHexString($evixVault).ToLowerInvariant()} | ConvertTo-Json -Compress)
        EVIX_ACTIVE_KEY_ID = 'v1'
        EVIX_MAIL_MODE = 'fixture'
        EVIX_PROVIDER_MODE = 'fixture'
        EVIX_MAILBOX_DIR = Join-Path $evixLocal 'mailbox'
        EVIX_COOKIE_NAME = 'evix_session'
    }
    [System.IO.File]::WriteAllText($evixConfig, ($evixValues | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
}
$evixValues = Get-Content -Raw -LiteralPath $evixConfig | ConvertFrom-Json -AsHashtable
foreach ($evixEntry in $evixValues.GetEnumerator()) { [Environment]::SetEnvironmentVariable($evixEntry.Key, [string]$evixEntry.Value, 'Process') }
$env:UV_CACHE_DIR = Join-Path $evixLocal 'uv-cache'
$env:NEXT_TELEMETRY_DISABLED = '1'
