# EVI-X Full-Stack Offline Verification Gate
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$p0Env = Join-Path $PSScriptRoot 'p0-env.ps1'

if (Test-Path -LiteralPath $p0Env) {
  . $p0Env
}

# Enforce zero paid API keys and deterministic offline scholar mode across all gates.
$env:OPENAI_API_KEY = ''
$env:DEEPSEEK_API_KEY = ''
$env:GEMINI_API_KEY = ''
$env:ANTHROPIC_API_KEY = ''
$env:EVIX_ENABLE_LIVE_SCHOLAR_API = '0'

$basetemp = Join-Path ([System.IO.Path]::GetTempPath()) "evix-verify-pytest-$PID"

try {
  Write-Host '=== 1/4 Repo Layout Check ==='
  Set-Location $root
  python -X utf8 scripts/check-repo-layout.py
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host '=== 2/4 Frontend Topic, Assets & TypeScript ==='
  Set-Location (Join-Path $root 'apps\frontend')
  npm run topic:check
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npm run security:assets
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npx tsc --noEmit
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host '=== 3/4 Frontend Core Unit Suites ==='
  $frontendSuites = @(
    'tests/page-art.test.mjs',
    'tests/cover-assembly.test.mjs',
    'tests/image-gen-engine.test.mjs',
    'tests/rich-study.test.mjs',
    'tests/studios-and-pipeline.test.mjs',
    'tests/statistical-guardrails.test.mjs',
    'tests/resource-library.test.mjs',
    'tests/report-insert.test.mjs',
    'tests/agent-autonomous-loop.test.mjs'
  )
  if (Test-Path -LiteralPath 'tests/ui-de-tech-and-typography-guard.test.mjs') {
    $frontendSuites += 'tests/ui-de-tech-and-typography-guard.test.mjs'
  }
  node --experimental-strip-types --test @frontendSuites
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host '=== 4/4 Backend Pytest Suites ==='
  Set-Location (Join-Path $root 'apps\backend')
  if (Test-Path -LiteralPath $basetemp) {
    Remove-Item -Recurse -Force -LiteralPath $basetemp
  }
  New-Item -ItemType Directory -Force -Path $basetemp | Out-Null

  $venvPython = Join-Path $PWD '.venv\Scripts\python.exe'
  if (-not (Test-Path -LiteralPath $venvPython)) {
    $venvPython = Join-Path $PWD '.venv/bin/python'
  }
  if (-not (Test-Path -LiteralPath $venvPython)) {
    $venvPython = 'python'
  }

  $backendSuites = @(
    'tests/test_page_art.py',
    'tests/test_cover_assembly.py',
    'tests/test_word_cloud_render.py',
    'tests/test_pre_submission_gate.py',
    'tests/test_full_report_section.py',
    'tests/test_section_draft.py'
  )
  if (Test-Path -LiteralPath 'tests/test_outbound_de_tech_and_prose_guard.py') {
    $backendSuites += 'tests/test_outbound_de_tech_and_prose_guard.py'
  }

  & $venvPython -m pytest -q --basetemp="$basetemp" -p no:cacheprovider @backendSuites
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host '=== ALL VERIFICATION GATES PASSED ==='
}
finally {
  Set-Location $root
  if (Test-Path -LiteralPath $basetemp) {
    Remove-Item -Recurse -Force -LiteralPath $basetemp -ErrorAction SilentlyContinue
  }
}
