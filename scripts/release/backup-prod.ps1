<#
.SYNOPSIS
  Production pg_dump + the DEPLOY-CHECKLIST section 0.3 (a)(b)(c) proofs, before ANY production migration.

.DESCRIPTION
  OWNER / LEAD-RUN ONLY, at release time. Claude never runs this.
  - Reads the session-pooler host from D:\TappyAI-backups\pghost.txt and the password ONLY through a
    libpq password file (D:\TappyAI-backups\pgpass, line format
    <host>:5432:postgres:postgres.fwznnobrdctuskgrvuik:<password>). The password is never read into
    this script, never put in an env var, never printed.
  - Runs pg_dump / pg_restore / psql from the official postgres:17 image (prod is PostgreSQL 17.x).
  - Writes D:\TappyAI-backups\prod-<yyyyMMdd-HHmm>[-<Label>]\ with prod.dump, prod-schema.sql,
    pg_dump.log, SHA256.txt, toc.txt, counts-prod.txt and, only when every check passes,
    CHECKS-PASSED.json - the marker scripts/release/apply-migration.sh insists on.
  - Any failed check: writes CHECKS-FAILED.txt, prints a red banner, exits 1. Do NOT start section 1.

  The only statements sent to production are pg_dump's own reads and one read-only count query
  (session forced to default_transaction_read_only=on).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\wtrel\scripts\release\backup-prod.ps1
  powershell -ExecutionPolicy Bypass -File C:\wtrel\scripts\release\backup-prod.ps1 -Label pre-sec -RestoreCheck
#>
[CmdletBinding()]
param(
  [string]$BackupRoot = 'D:\TappyAI-backups',
  [string]$PgPassFile = 'D:\TappyAI-backups\pgpass',
  [string]$PgHostFile = 'D:\TappyAI-backups\pghost.txt',
  [string]$Label = '',
  [double]$MinDumpMB = 1.0,
  # section 0.3(d): restore into a throwaway local container and compare row counts (recommended, slower).
  [switch]$RestoreCheck
)

# Native tools write progress to stderr; with "Stop", Windows PowerShell 5.1 turns a redirected stderr
# line into a terminating error. Every step below checks $LASTEXITCODE and output explicitly instead.
$ErrorActionPreference = 'Continue'
$DbUser = 'postgres.fwznnobrdctuskgrvuik'
$Image  = 'postgres:17'
# section 0.3(c): the data the release migrations touch must be inside the dump.
$RequiredTableData = @(
  'auth users',
  'public profiles', 'public reviews', 'public user_memory', 'public decision_evidence',
  'public anon_chat_usage', 'public notifications', 'public review_likes', 'public groups',
  'public group_members', 'public audit_log'
)
$CountSql = @"
select 'auth.users' t, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'reviews', count(*) from public.reviews
union all select 'user_memory', count(*) from public.user_memory
union all select 'decision_evidence', count(*) from public.decision_evidence
union all select 'anon_chat_usage', count(*) from public.anon_chat_usage
union all select 'notifications', count(*) from public.notifications
union all select 'review_likes', count(*) from public.review_likes
union all select 'groups', count(*) from public.groups
union all select 'group_members', count(*) from public.group_members
union all select 'audit_log', count(*) from public.audit_log
order by 1;
"@

function Fail([string]$msg) {
  Write-Host ''
  Write-Host '############################################################' -ForegroundColor Red
  Write-Host "  BACKUP CHECK FAILED: $msg" -ForegroundColor Red
  Write-Host '  Do NOT apply any production migration. Fix and re-run.' -ForegroundColor Red
  Write-Host '############################################################' -ForegroundColor Red
  if ($script:d -and (Test-Path $script:d)) {
    "FAILED $(Get-Date -Format o)`n$msg" | Out-File -Encoding utf8 (Join-Path $script:d 'CHECKS-FAILED.txt')
    Remove-Item -ErrorAction SilentlyContinue (Join-Path $script:d 'CHECKS-PASSED.json')
  }
  exit 1
}

# Runs one command in postgres:17 with the pgpass file copied to a 0600 file inside the container
# (libpq ignores a password file with group/world access, which is how a Windows bind mount looks).
function Invoke-Pg([string]$shellCmd, [string[]]$extraMounts = @()) {
  $dargs = @('run', '--rm',
    '-e', "PGHOST=$script:PgHost", '-e', 'PGPORT=5432', '-e', "PGUSER=$DbUser", '-e', 'PGDATABASE=postgres',
    '-e', 'PGSSLMODE=require', '-e', 'PGAPPNAME=tappyai-release-backup',
    '-v', "${PgPassFile}:/secrets/pgpass:ro")
  foreach ($m in $extraMounts) { $dargs += @('-v', $m) }
  $dargs += @($Image, 'sh', '-c', "cp /secrets/pgpass /tmp/.pgpass && chmod 600 /tmp/.pgpass && export PGPASSFILE=/tmp/.pgpass && $shellCmd")
  & docker @dargs
}

# ---------- preconditions ----------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'docker not found (start Docker Desktop).' }
& docker info *> $null; if ($LASTEXITCODE -ne 0) { Fail 'Docker Desktop is not running.' }
if (-not (Test-Path $PgPassFile)) { Fail "pgpass file missing: $PgPassFile (owner action section 3b of RELEASE-PLAN)." }
if (-not (Test-Path $PgHostFile)) { Fail "host file missing: $PgHostFile (owner action section 3b of RELEASE-PLAN)." }
$script:PgHost = (Get-Content $PgHostFile -Raw).Trim()
if ($script:PgHost -notmatch '^[a-z0-9.-]+$') { Fail "pghost.txt must hold only the host name (got something else)." }
if ($script:PgHost -like 'db.*.supabase.co') { Fail 'pghost.txt holds the DIRECT host (IPv6-only on Free). Use the Session pooler host (Connect -> Session pooler).' }
if ($script:PgHost -notlike '*.pooler.supabase.com') { Write-Warning "Host '$($script:PgHost)' is not a *.pooler.supabase.com host - double-check it is the SESSION pooler (port 5432)." }

# Validate the pgpass line WITHOUT printing it: host:port:db:user:password, host must equal pghost.txt.
$pgLines = @(Get-Content $PgPassFile | Where-Object { $_ -and -not $_.StartsWith('#') })
if ($pgLines.Count -ne 1) { Fail "pgpass must contain exactly one line (found $($pgLines.Count))." }
$parts = $pgLines[0].Split(':', 5)
if ($parts.Count -ne 5) { Fail 'pgpass line must be <host>:5432:postgres:postgres.fwznnobrdctuskgrvuik:<password>.' }
if ($parts[0] -ne $script:PgHost) { Fail 'pgpass host field does not equal pghost.txt.' }
if ($parts[1] -ne '5432') { Fail 'pgpass port must be 5432 (session pooler), not 6543 (transaction pooler).' }
if ($parts[2] -ne 'postgres' -or $parts[3] -ne $DbUser) { Fail "pgpass db/user must be postgres / $DbUser." }
if ([string]::IsNullOrWhiteSpace($parts[4])) { Fail 'pgpass password field is empty.' }
$parts = $null; $pgLines = $null

# Keep the dump out of git worktrees and cloud-synced folders.
if ($BackupRoot -match 'OneDrive|Dropbox|Google Drive|iCloud') { Fail "BackupRoot '$BackupRoot' looks cloud-synced." }
New-Item -ItemType Directory -Force $BackupRoot | Out-Null
Push-Location $BackupRoot
try { $inGit = (& git rev-parse --is-inside-work-tree 2>$null) } catch { $inGit = $null }
Pop-Location
if ($inGit -eq 'true') { Fail "BackupRoot '$BackupRoot' is inside a git work tree." }

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$name = "prod-$stamp" + $(if ($Label) { "-$Label" } else { '' })
$script:d = Join-Path $BackupRoot $name
if (Test-Path $script:d) { Fail "$($script:d) already exists." }
New-Item -ItemType Directory -Force $script:d | Out-Null
Write-Host "Backup dir: $($script:d)"

& docker pull -q $Image | Out-Null

# ---------- server identity + row counts (read-only session) ----------
# SQL goes through files, never inline: Windows PowerShell 5.1 mangles embedded double quotes in native args.
"select current_setting('server_version') || ' | ' || current_database();" | Out-File -Encoding ascii (Join-Path $script:d 'ident.sql')
$ident = Invoke-Pg "psql -X -q -At -v ON_ERROR_STOP=1 -c 'SET default_transaction_read_only = on' -f /backup/ident.sql" @("$($script:d):/backup")
if ($LASTEXITCODE -ne 0 -or -not $ident) { Fail 'Could not connect with the pgpass file (wrong host/password, or pooler unreachable).' }
Write-Host "Server: $ident"
if ($ident -notmatch '^17\.') { Fail "Server is not PostgreSQL 17 ($ident) - pg_dump 17 must match the server major version." }

$countFile = Join-Path $script:d 'counts-prod.txt'
$CountSql | Out-File -Encoding ascii (Join-Path $script:d 'counts.sql')
Invoke-Pg "psql -X -q -At -F '|' -v ON_ERROR_STOP=1 -c 'SET default_transaction_read_only = on' -f /backup/counts.sql" @("$($script:d):/backup") |
  Out-File -Encoding utf8 $countFile
if ($LASTEXITCODE -ne 0) { Fail 'Row-count query failed (a table in the list may not exist on prod - edit $CountSql and re-run).' }

# ---------- section 0.2 dumps ----------
$log = Join-Path $script:d 'pg_dump.log'
Write-Host 'pg_dump (custom format, public+auth+storage) ...'
Invoke-Pg 'pg_dump --format=custom --schema=public --schema=auth --schema=storage --file=/backup/prod.dump --verbose' @("$($script:d):/backup") *> $log
"exit=$LASTEXITCODE" | Add-Content $log
Write-Host 'pg_dump (schema only, readable) ...'
Invoke-Pg 'pg_dump --schema-only --schema=public --schema=auth --schema=storage --file=/backup/prod-schema.sql' @("$($script:d):/backup") *> (Join-Path $script:d 'pg_dump-schema.log')
$schemaExit = $LASTEXITCODE
$dump = Join-Path $script:d 'prod.dump'
if (-not (Test-Path $dump)) { Fail 'prod.dump was not written.' }
$sha = (Get-FileHash $dump -Algorithm SHA256).Hash.ToLower()
"$sha  prod.dump" | Out-File -Encoding ascii (Join-Path $script:d 'SHA256.txt')

# ---------- section 0.3 (a) finished cleanly ----------
$last = (Get-Content $log | Select-Object -Last 1)
if ($last -ne 'exit=0') { Fail "(a) pg_dump did not exit 0 ($last). See $log" }
$bad = Select-String -Path $log -Pattern 'error|fatal|permission denied' -CaseSensitive:$false
if ($bad) { $bad | Select-Object -First 10 | ForEach-Object { Write-Host $_.Line -ForegroundColor Red }; Fail "(a) pg_dump.log contains error/fatal/permission denied lines." }
if ($schemaExit -ne 0) { Fail '(a) schema-only pg_dump failed.' }
Write-Host '(a) OK - pg_dump exit=0, no error lines' -ForegroundColor Green

# ---------- section 0.3 (b) not empty ----------
$mb = (Get-Item $dump).Length / 1MB
if ($mb -lt $MinDumpMB) { Fail ("(b) prod.dump is only {0:N2} MB (< {1} MB) - looks schema-only." -f $mb, $MinDumpMB) }
Write-Host ('(b) OK - prod.dump {0:N1} MB' -f $mb) -ForegroundColor Green

# ---------- section 0.3 (c) data present ----------
$toc = Join-Path $script:d 'toc.txt'
& docker run --rm -v "$($script:d):/backup" $Image pg_restore --list /backup/prod.dump | Out-File -Encoding utf8 $toc
if ($LASTEXITCODE -ne 0) { Fail '(c) pg_restore --list failed - the dump is unreadable.' }
$tocText = Get-Content $toc -Raw
$missing = @($RequiredTableData | Where-Object { $tocText -notmatch ("TABLE DATA " + [regex]::Escape($_) + " ") })
if ($missing.Count -gt 0) { Fail "(c) TABLE DATA missing in the dump for: $($missing -join ', ')" }
Write-Host "(c) OK - TABLE DATA present for all $($RequiredTableData.Count) tables" -ForegroundColor Green

# ---------- section 0.3 (d) optional restore + count compare ----------
$dResult = 'skipped'
if ($RestoreCheck) {
  $c = "tappy-restore-check-$stamp"
  try {
    & docker run -d --name $c -e POSTGRES_PASSWORD=scratch $Image | Out-Null
    Start-Sleep 10
    & docker exec $c psql -U postgres -q -c "create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create role supabase_storage_admin; create role supabase_admin;" | Out-Null
    & docker cp $dump "${c}:/tmp/prod.dump"
    & docker exec $c pg_restore -U postgres -d postgres --no-owner --no-privileges /tmp/prod.dump *> (Join-Path $script:d 'restore-check.log')
    $restored = & docker exec $c psql -U postgres -X -At -F '|' -c $CountSql 2>&1
    $restored | Out-File -Encoding utf8 (Join-Path $script:d 'counts-restored.txt')
    $prodCounts = Get-Content $countFile | Where-Object { $_ }
    $diff = Compare-Object $prodCounts ($restored | Where-Object { $_ -match '\|' })
    if ($diff) { $diff | Format-Table | Out-String | Write-Host -ForegroundColor Yellow; Fail '(d) restored row counts differ from production (see counts-prod.txt / counts-restored.txt; writes between the count and the dump also cause this - re-run in a quiet moment).' }
    $dResult = 'passed'
    Write-Host '(d) OK - restored counts equal production counts' -ForegroundColor Green
  } finally {
    & docker rm -f $c *> $null
  }
}

# ---------- marker ----------
$gitSha = ''
try { $gitSha = (& git -C (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) rev-parse HEAD 2>$null) } catch { }
$marker = [ordered]@{
  status          = 'CHECKS-PASSED'
  createdLocal    = (Get-Date -Format o)
  createdUtcEpoch = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
  dir             = $script:d
  host            = $script:PgHost
  server          = "$ident"
  dumpBytes       = (Get-Item $dump).Length
  dumpSha256      = $sha
  checks          = [ordered]@{ a = 'passed'; b = 'passed'; c = 'passed'; d = $dResult }
  repoHead        = "$gitSha"
}
$marker | ConvertTo-Json -Depth 4 | Out-File -Encoding ascii (Join-Path $script:d 'CHECKS-PASSED.json')
@"
TappyAI production backup $name
Contains auth.users (emails, password hashes) and every user's content. Never commit, upload or attach.
Delete after: <FILL DATE - once the release has been stable>
"@ | Out-File -Encoding utf8 (Join-Path $script:d 'README.txt')

Write-Host ''
Write-Host "BACKUP OK -> $($script:d)" -ForegroundColor Green
Write-Host "Pass this to apply-migration.sh:  --i-have-a-valid-backup '$($script:d)'" -ForegroundColor Green
exit 0
