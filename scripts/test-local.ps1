$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
Set-Location -LiteralPath $projectRoot

$localToolRoot = Join-Path $projectRoot '.local-tools'

if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $localToolRoot 'android-sdk'
}
if (-not $env:ANDROID_SDK_ROOT) {
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
}
if (-not $env:GRADLE_USER_HOME) {
  $env:GRADLE_USER_HOME = Join-Path $localToolRoot 'gradle'
}
if (-not $env:ANDROID_USER_HOME) {
  $env:ANDROID_USER_HOME = Join-Path $localToolRoot 'android-user-home'
}
if (-not $env:ANDROID_AVD_HOME) {
  $env:ANDROID_AVD_HOME = Join-Path $localToolRoot 'android-avd'
}
if (-not $env:NPM_CONFIG_CACHE) {
  $env:NPM_CONFIG_CACHE = Join-Path $localToolRoot 'npm-cache'
}
$env:NODE_OPTIONS = '--max-old-space-size=8192'
$androidPathEntries = @(
  (Join-Path $env:ANDROID_HOME 'platform-tools'),
  (Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin')
)
$env:Path = (($androidPathEntries + $env:Path) -join [System.IO.Path]::PathSeparator)

function Invoke-Checked {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host "==> $Name"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

Invoke-Checked 'TypeScript' { npm run typecheck }
Invoke-Checked 'Expo dependency check' { npx expo install --check }

Write-Host '==> Expo doctor'
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$doctorOutput = & npx --yes expo-doctor 2>&1
$doctorCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
$doctorOutput | ForEach-Object { Write-Host $_ }
if ($doctorCode -ne 0) {
  $doctorText = $doctorOutput -join "`n"
  $isKnownNativeProjectWarning = (Test-Path -LiteralPath (Join-Path $projectRoot 'android')) -and
    $doctorText.Contains('This project contains native project folders') -and
    $doctorText.Contains('EAS Build will not sync')
  if ($isKnownNativeProjectWarning) {
    Write-Warning 'expo-doctor reported the expected CNG warning because android/ exists for local device builds.'
  } else {
    throw "Expo doctor failed with exit code $doctorCode"
  }
}

$exportDir = Join-Path $projectRoot '.expo-test-export'
Invoke-Checked 'Android bundle export' { npx expo export --platform android --output-dir $exportDir }

if (Test-Path -LiteralPath $exportDir) {
  $resolvedExport = (Resolve-Path -LiteralPath $exportDir).Path
  if (-not $resolvedExport.StartsWith($projectRoot.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete outside project: $resolvedExport"
  }
  Remove-Item -LiteralPath $resolvedExport -Recurse -Force
}
