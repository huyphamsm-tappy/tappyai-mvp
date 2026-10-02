param([string]$Override = '')
$sp = 'C:\Users\Admin\AppData\Local\Temp\claude\D--Claude-Projects-TappyAI--worktrees-g1-growth\89302721-91af-4d74-9d1b-c9d52232820f\scratchpad'
$spf = $sp.Replace('\', '/')
$iso = Join-Path $sp 'guardproof2'
Set-Location $iso
$env:NODE_OPTIONS = "--require $spf/netblock.cjs"
if ($Override) { $env:ALLOW_PROD_SUPABASE_IN_DEV = '1' } else { $env:ALLOW_PROD_SUPABASE_IN_DEV = $null }
$tag = if ($Override) { 'override' } else { 'guard' }
foreach ($cmd in @('build', 'start', 'dev')) {
  if ($Override -and $cmd -ne 'start') { continue }
  $log = Join-Path $sp "guardproof2_${tag}_$cmd.netlog"
  [IO.File]::WriteAllText($log, '')
  $env:NETLOG = $log
  $out = Join-Path $sp "guardproof2_${tag}_$cmd.out"
  $argv = if ($cmd -eq 'build') { @('node_modules\next\dist\bin\next', 'build') } else { @('node_modules\next\dist\bin\next', $cmd, '-p', '3999') }
  $p = Start-Process -FilePath node -ArgumentList $argv -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError "$out.err"
  "===== ALLOW_PROD_SUPABASE_IN_DEV=$($env:ALLOW_PROD_SUPABASE_IN_DEV)  next $cmd  -> exit status $($p.ExitCode)"
  $lines = Get-Content "$out.err", $out -ErrorAction SilentlyContinue | Where-Object { $_ -match 'REFUSING|Env files|Variables with|Dir:|Cannot find|OVERRIDDEN|PRODUCTION project|files:|Could not find|Error:' } | Select-Object -First 7
  foreach ($l in $lines) { '   ' + $l.Trim() }
  $n = @(Get-Content $log | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json })
  "   netlog: node-processes=$(@($n | Where-Object kind -eq 'preload').Count)  remote-attempts=$(@($n | Where-Object { $_.kind -match 'REMOTE' }).Count)  loopback-connects=$(@($n | Where-Object kind -eq 'connect-loopback').Count)"
}
$env:NODE_OPTIONS = $null; $env:NETLOG = $null; $env:ALLOW_PROD_SUPABASE_IN_DEV = $null
