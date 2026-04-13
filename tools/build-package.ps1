param(
  [string]$OutputPath = "foundry-vtt-status-tracker.zip"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stagingDir = Join-Path $repoRoot ".package-staging"
$outputFile = Join-Path $repoRoot $OutputPath

if (Test-Path $stagingDir) {
  Remove-Item $stagingDir -Recurse -Force
}

if (Test-Path $outputFile) {
  Remove-Item $outputFile -Force
}

New-Item -ItemType Directory -Path $stagingDir | Out-Null

$pathsToCopy = @(
  "module.json",
  "README.md",
  "lang",
  "scripts",
  "styles",
  "templates"
)

foreach ($path in $pathsToCopy) {
  Copy-Item -Path (Join-Path $repoRoot $path) -Destination (Join-Path $stagingDir $path) -Recurse -Force
}

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $outputFile -CompressionLevel Optimal
Remove-Item $stagingDir -Recurse -Force

Write-Output "Created package: $outputFile"