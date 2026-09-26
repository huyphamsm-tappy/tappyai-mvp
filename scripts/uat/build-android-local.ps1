# Manual UAT: build + install the Android DEBUG app against YOUR local web server and the AUDIT
# Supabase project. Values come from the repo's .env.local and are handed to Gradle as
# ORG_GRADLE_PROJECT_* environment variables - never printed, never written to a file.
#
#   powershell -ExecutionPolicy Bypass -File scripts\uat\build-android-local.ps1            # build + install on the running emulator
#   powershell -ExecutionPolicy Bypass -File scripts\uat\build-android-local.ps1 -NoInstall # build only
#   powershell -ExecutionPolicy Bypass -File scripts\uat\build-android-local.ps1 -Reverse   # emulator OR a USB phone:
#       the app talks to http://localhost:<Port>/ and `adb reverse` carries it to this machine. Re-run
#       `adb reverse tcp:<Port> tcp:<Port>` after every re-plug / emulator restart.
#
# Refuses to run unless .env.local points at the audit project (never production).
param([switch]$NoInstall, [switch]$Reverse, [int]$Port = 3007)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$vals = @{}
foreach ($l in Get-Content (Join-Path $root '.env.local')) {
    if ($l -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $vals[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") }
}
if ($vals['NEXT_PUBLIC_SUPABASE_URL'] -notmatch 'zdaprdfgpbpnxyofagmc') { throw 'REFUSING: .env.local is not the audit Supabase project' }
$env:ORG_GRADLE_PROJECT_TAPPYAI_SUPABASE_URL = $vals['NEXT_PUBLIC_SUPABASE_URL']
$env:ORG_GRADLE_PROJECT_TAPPYAI_SUPABASE_ANON_KEY = $vals['NEXT_PUBLIC_SUPABASE_ANON_KEY']
# 10.0.2.2 is the emulator's route to this machine's localhost; with -Reverse, adb carries localhost
# itself, which works for a physical phone too (the debug network config allows cleartext to both).
$apiHost = if ($Reverse) { 'localhost' } else { '10.0.2.2' }
$env:ORG_GRADLE_PROJECT_TAPPYAI_API_BASE_URL_DEBUG = "http://${apiHost}:$Port/"
$env:ORG_GRADLE_PROJECT_TAPPYAI_WEB_APP_URL = "http://${apiHost}:$Port"
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
Set-Location (Join-Path $root 'android')
$task = if ($NoInstall) { ':app:assembleDebug' } else { ':app:installDebug' }
.\gradlew.bat $task --console=plain
if ($LASTEXITCODE -ne 0) { throw "gradle $task failed ($LASTEXITCODE)" }
if ($Reverse -and -not $NoInstall) {
    $adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
    & $adb reverse "tcp:$Port" "tcp:$Port"
    if ($LASTEXITCODE -ne 0) { throw "adb reverse tcp:$Port failed ($LASTEXITCODE)" }
}
Write-Host "OK: $task - app id com.tappyai.app.debug, API http://${apiHost}:$Port/, Supabase audit"
