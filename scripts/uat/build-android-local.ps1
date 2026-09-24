# Manual UAT: build + install the Android DEBUG app against YOUR local web server and the AUDIT
# Supabase project. Values come from the repo's .env.local and are handed to Gradle as
# ORG_GRADLE_PROJECT_* environment variables - never printed, never written to a file.
#
#   powershell -ExecutionPolicy Bypass -File scripts\uat\build-android-local.ps1            # build + install on the running emulator
#   powershell -ExecutionPolicy Bypass -File scripts\uat\build-android-local.ps1 -NoInstall # build only
#
# Refuses to run unless .env.local points at the audit project (never production).
param([switch]$NoInstall, [int]$Port = 3007)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$vals = @{}
foreach ($l in Get-Content (Join-Path $root '.env.local')) {
    if ($l -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $vals[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") }
}
if ($vals['NEXT_PUBLIC_SUPABASE_URL'] -notmatch 'zdaprdfgpbpnxyofagmc') { throw 'REFUSING: .env.local is not the audit Supabase project' }
$env:ORG_GRADLE_PROJECT_TAPPYAI_SUPABASE_URL = $vals['NEXT_PUBLIC_SUPABASE_URL']
$env:ORG_GRADLE_PROJECT_TAPPYAI_SUPABASE_ANON_KEY = $vals['NEXT_PUBLIC_SUPABASE_ANON_KEY']
# 10.0.2.2 is the emulator's route to this machine's localhost.
$env:ORG_GRADLE_PROJECT_TAPPYAI_API_BASE_URL_DEBUG = "http://10.0.2.2:$Port/"
$env:ORG_GRADLE_PROJECT_TAPPYAI_WEB_APP_URL = "http://10.0.2.2:$Port"
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
Set-Location (Join-Path $root 'android')
$task = if ($NoInstall) { ':app:assembleDebug' } else { ':app:installDebug' }
.\gradlew.bat $task --console=plain
if ($LASTEXITCODE -ne 0) { throw "gradle $task failed ($LASTEXITCODE)" }
Write-Host "OK: $task - app id com.tappyai.app.debug, API http://10.0.2.2:$Port/, Supabase audit"
