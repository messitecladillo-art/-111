param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$inputFile = (Resolve-Path -LiteralPath $InputPath).Path
$outputFile = [System.IO.Path]::GetFullPath($OutputPath)
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $outputFile.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'QA output must stay within this project.' }
if ([IO.Path]::GetExtension($inputFile) -ne '.docx' -or [IO.Path]::GetExtension($outputFile) -ne '.pdf') { throw 'Expected DOCX input and PDF output.' }
if (Test-Path -LiteralPath $outputFile) { throw 'Keep prior renders; choose a new output filename.' }
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputFile)) | Out-Null
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3
  $document = $word.Documents.Open($inputFile, $false, $true, $false)
  $document.Fields.Update() | Out-Null
  foreach ($toc in $document.TablesOfContents) { $toc.Update() }
  $document.Repaginate()
  $pages = $document.ComputeStatistics(2)
  $document.ExportAsFixedFormat($outputFile, 17)
  @{ renderer = 'installed Microsoft Word'; input = $inputFile; output = $outputFile; pages = $pages; originalSaved = $false } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $document) { $document.Close(0); [Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null }
  if ($null -ne $word) { $word.Quit(0); [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null }
}
