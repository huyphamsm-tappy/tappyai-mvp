// Launcher of the LIVE TRIAL: runs liveTrial.test.ts in its OWN node process and owns that process's whole life (round 2g, D1/D3).
//
//   node scripts/uat/consultUat/liveTrialLauncher.mjs                    the real trial (one question, real network, real money - only after every gate in the sheet)
//   node scripts/uat/consultUat/liveTrialLauncher.mjs --plumbing-check   starts the same child WITHOUT the confirmation (the trial test is skipped): no request, no cost
//
// WHY A SEPARATE PROCESS. The trial wraps fetch and node:http(s) while it runs; a wrapper that is taken off after a short drain leaves later background work free
// to send anything. Here the child keeps the network CLOSED until it ends (the core runs with afterTrial: 'deny') and this launcher ends the child: as soon as the
// summary block has arrived (or after a time limit) the whole process TREE is killed and the launcher checks that the process is gone.
//
// WHAT THE CHILD SEES. Only an allow-list of environment variables is passed on: the two keys, the benchmark flags and BENCH_* variables, and the few system variables
// node needs. Nothing else - no NODE_OPTIONS, no proxy variables, no CI. A variable that looks like a trial setting (CONSULT_*, LLM_*, TAPPY_* ...) but is not in the
// list is REFUSED by name (the trial would not run with it). The child is started with an EXPLICIT command line (no --use-env-proxy, no preload). The launcher itself
// sets BENCH_LIVE_TRIAL and BENCH_TRIAL_ISOLATED (a random per-run nonce), for the child only: the Owner never sets BENCH_LIVE_TRIAL in a shell.
//
// WHAT THE OWNER SEES. The child's output is read into memory, never shown. Only the text between the summary markers (which carry the run's nonce, so that text the
// child merely prints cannot forge them) is printed, after the keys have been removed from it. A redacted copy of the whole output is written next to the results
// (BENCH_TRIAL_OUT_DIR, drive D only) for the Owner's own eyes. No key is ever an argument or printed.
//
// LIMITS (stated): the tree is ended while the child is alive (taskkill /T needs the parent). If the child exits BY ITSELF while a descendant still holds its output pipes
// the launcher stops waiting after 3 s and says so (exit 3); it does NOT kill by a pid that no longer belongs to a live process (a Windows pid can be reused).
//
// This file uses only node: modules (it must run with plain `node`) and has no side effect when imported.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The markers around the blocks the child prints. They carry the run's nonce: `<<TRIAL-SUMMARY-BEGIN:<nonce>>>`. */
export const marker = (kind, nonce) => `<<TRIAL-${kind}:${nonce}>>`
export const SUMMARY_BEGIN = 'SUMMARY-BEGIN', SUMMARY_END = 'SUMMARY-END', REFUSED_BEGIN = 'REFUSED-BEGIN', REFUSED_END = 'REFUSED-END'

/** The system variables node and vitest need on Windows / POSIX. Nothing that could change where a connection goes. */
export const SYSTEM_ENV_NAMES = [
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'OS', 'TEMP', 'TMP', 'TMPDIR',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'HOME', 'LANG', 'LC_ALL',
]
/** The trial's own variables besides the flags. */
export const TRIAL_ENV_NAMES = [
  'OPENAI_API_KEY', 'SERPER_API_KEY',
  'BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD', 'BENCH_CONFIRM_SPEND',
  'BENCH_EXPECT_CONSULTATIVE_V1', 'BENCH_EXPECT_CONSULT_V2', 'BENCH_TRIAL_QUESTION_FILE', 'BENCH_TRIAL_OUT_DIR',
]
/**
 * The benchmark flag names (kept equal to BENCH_FLAG_NAMES in liveRunner.ts by liveTrialLauncher.test.ts). A flag the Owner set is passed on, an unset one stays unset.
 * (The audit file variables are in the list on purpose: if the Owner set them the child must SEE them, so that its preflight refuses.)
 */
export const FLAG_ENV_NAMES = [
  'BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD',
  'TURN_WEB_TICKET', 'SEARCH_FALLBACK_GATE',
  'CONSULT_LUNA', 'CONSULT_LUNA_FAST', 'CONSULT_LUNA_PLAN', 'CONSULT_LUNA_ONE', 'CONSULTATIVE_V1', 'CONSULT_V2', 'CONSULT_V3',
  'TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'TAPPY_ANSWER_V4', 'RETRIEVAL_V5',
  'LLM_PROVIDER', 'LLM_OPENAI_API', 'AGENT_MODEL', 'HAIKU_FALLBACK', 'C2_REQUEST_BUDGET',
  'MONEY_GUARD_KEEP_VERIFIED', 'PLACE_CLAIM_KEEP_VERIFIED_PRICE', 'LEGACY_STREAM_TRACE', 'SERPER_CACHE_V2',
  'SERPER_USD_PER_CREDIT', 'LLM_LUNA_MODEL', 'LLM_CONSULT_MODEL', 'LLM_INTENT_MODEL', 'LLM_PLAN_MODEL',
  'AUDIT_DRY_RUN', 'AUDIT_MODEL_REQUEST_FILE', 'AUDIT_USAGE_LOG_FILE',
  // round 3b-1: routing guard for the aviation word "hàng không" (intent.ts routeFlightGuardOn); default OFF
  'ROUTE_FLIGHT_HANG_KHONG_GUARD',
]
/** Names that look like a setting of the trial or of the route: when one is set but is not in the allow-list the launcher refuses instead of silently dropping it. */
const LOOKS_LIKE_A_SETTING = /^(CONSULT|CONSULTATIVE|TAPPY|LLM|SERPER|OPENAI|AUDIT|FILM|BENCH|C2|MONEY|PLACE|LEGACY|RETRIEVAL|HAIKU|AGENT|TURN|SEARCH|STYLE|CCP)_/i

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isAllowedName = name => {
  const lower = name.toLowerCase()
  return [...SYSTEM_ENV_NAMES, ...TRIAL_ENV_NAMES, ...FLAG_ENV_NAMES].some(a => (process.platform === 'win32' ? a.toLowerCase() === lower : a === name))
}

/** Removes the exact key values (case-insensitive, at least 8 characters) and anything shaped like an OpenAI key. Same rule as redactSecrets in liveRunner.ts. */
export function redactText(text, env) {
  let out = String(text)
  for (const name of ['OPENAI_API_KEY', 'SERPER_API_KEY']) {
    const v = env[name]
    if (v && v.length >= 8) out = out.replace(new RegExp(escapeRegExp(v), 'gi'), '***')
  }
  return out.replace(/\bsk-[A-Za-z0-9_*.-]{4,}/g, 'sk-***')
}

/** The child's environment: ONLY the allow-listed names that the parent has set, plus the two markers the launcher sets itself. Pure. */
export function buildChildEnv(parentEnv, { confirm, nonce }) {
  const out = {}
  for (const [k, v] of Object.entries(parentEnv)) {
    if (v === undefined) continue
    if (isAllowedName(k)) out[k] = v
  }
  out.BENCH_TRIAL_ISOLATED = nonce
  if (confirm) out.BENCH_LIVE_TRIAL = 'I-UNDERSTAND-THIS-SPENDS-REAL-MONEY'
  return out
}

/** Reasons the launcher itself will not start (the child's own preflight does the authoritative checks and reports its reasons in the refused block). Pure. */
export function launcherRefusals(parentEnv) {
  const reasons = []
  if ((parentEnv.CI ?? '') !== '') reasons.push('CI is set: the live trial never runs in CI')
  if (parentEnv.BENCH_LIVE_TRIAL !== undefined) reasons.push('BENCH_LIVE_TRIAL is set in this shell: the launcher sets it itself, for the child only - remove it from the shell')
  if (parentEnv.BENCH_TRIAL_ISOLATED !== undefined) reasons.push('BENCH_TRIAL_ISOLATED is set in this shell: the launcher sets it itself, for the child only - remove it from the shell')
  for (const k of Object.keys(parentEnv)) {
    if (parentEnv[k] !== undefined && LOOKS_LIKE_A_SETTING.test(k) && !isAllowedName(k) && k !== 'BENCH_LIVE_TRIAL' && k !== 'BENCH_TRIAL_ISOLATED') {
      reasons.push(`${k} is set but is not one of the variables the trial passes on: the trial would run WITHOUT it and not measure what you set up; unset it`)
    }
  }
  return reasons
}

/** The text between two markers (the last complete block), or null. Pure. */
export function extractBlock(text, begin, end) {
  const e = text.lastIndexOf(end)
  if (e < 0) return null
  const b = text.lastIndexOf(begin, e)
  if (b < 0) return null
  return text.slice(b + begin.length, e).replace(/^\r?\n/, '').replace(/\r?\n$/, '')
}

/** Ends a process and everything it started. Windows: taskkill /T /F; elsewhere: the process group. Call it only for a process that is still ALIVE (a pid can be reused). */
export function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else { try { process.kill(-pid, 'SIGKILL') } catch { try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ } } }
}
export function isAlive(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e && e.code === 'EPERM' }
}

/**
 * The pids of every process that descends from `pid`, found by parent-process id (Windows: Get-CimInstance Win32_Process; elsewhere: ps). Windows keeps the parent id of an
 * orphan, so the descendants of a process that has already exited are still found. Best effort: [] when the listing fails.
 */
export function listDescendants(pid, sinceMs = 0) {
  try {
    if (process.platform === 'win32') {
      // Windows keeps the parent id of an orphan, and a pid can be REUSED: an older, unrelated process whose stale parent id happens to equal this pid would look like a
      // descendant. So only processes CREATED AFTER `sinceMs` (the moment the child was started) count, each pid is visited once (a stale cycle cannot loop), and the image
      // name is returned next to the pid so that the Owner can tell what it is.
      const script = `$since=[DateTimeOffset]::FromUnixTimeMilliseconds(${Math.floor(Number(sinceMs))}).UtcDateTime; $seen=@{}; function K($p){ Get-CimInstance Win32_Process -Filter "ParentProcessId=$p" | Where-Object { $_.CreationDate -and $_.CreationDate.ToUniversalTime() -ge $since } | ForEach-Object { if(-not $seen.ContainsKey($_.ProcessId)){ $seen[$_.ProcessId]=1; "$($_.ProcessId):$($_.Name)"; K $_.ProcessId } } }; (K ${Number(pid)}) -join ','`
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8', timeout: 15_000 })
      return String(r.stdout ?? '').trim().split(',').filter(Boolean).map(s => { const [p, ...n] = s.split(':'); return { pid: Number(p), name: n.join(':') } }).filter(x => Number.isInteger(x.pid) && x.pid > 0)
    }
    const r = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,comm='], { encoding: 'utf8', timeout: 15_000 })
    const kids = new Map()
    for (const line of String(r.stdout ?? '').split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
      if (m) kids.set(Number(m[2]), [...(kids.get(Number(m[2])) ?? []), { pid: Number(m[1]), name: m[3].trim() }])
    }
    const out = []
    const visited = new Set([Number(pid)])
    const queue = [Number(pid)]
    while (queue.length) { for (const k of kids.get(queue.shift()) ?? []) { if (!visited.has(k.pid)) { visited.add(k.pid); out.push(k); queue.push(k.pid) } } }
    return out
  } catch { return [] }
}

/**
 * Runs the child, reads its output in memory, ends it once an end marker has arrived (or at the time limit) and checks that it is gone.
 * `child` = { file, args } (default: node + vitest). `endMarkers` = the strings whose arrival means "the block is in" (the markers WITH the run's nonce).
 * Injectable for tests (no real vitest, no network).
 */
export async function runTrialChild({ child, cwd, env, endMarkers = [], graceMs = 750, timeLimitMs = 600_000, maxBytes = 8_000_000, now = Date.now, kill = killTree, alive = isAlive, descendants = listDescendants }) {
  const started = now()
  const proc = spawn(child.file, child.args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' })
  const pid = proc.pid
  let text = ''
  let bytes = 0
  let truncated = false
  let exitCode = null
  let exited = false
  let closed = false
  let killedBy = null
  let sawEnd = false
  let finish = () => {}
  const done = new Promise(resolve => { finish = resolve })
  // If the pipes do not close (a descendant holds them, or ending the process did not work) the launcher must not wait for ever: after 3 s it stops waiting.
  let giveUpArmed = false
  const armGiveUp = () => { if (!giveUpArmed) { giveUpArmed = true; setTimeout(() => finish(), 3_000) } }
  // The descendants seen while the tree was still known (before it was ended, or right after the child exited by itself): afterwards each one is checked, so that a process
  // that outlived the tree is REPORTED instead of being taken for gone. (Windows keeps the parent id of an orphan, so the listing still works after the parent exited.)
  const seen = new Map() // pid -> image name
  const snapshot = () => { for (const d of descendants(pid, started - 2_000)) if (d.pid !== pid) seen.set(d.pid, d.name) }
  // 'close' (not 'exit'): it fires once the output pipes are closed too, so the last chunk is not lost
  proc.on('close', () => { closed = true; exited = true; finish() })
  proc.on('error', () => { exited = true; finish() })
  proc.on('exit', code => { exitCode = code; exited = true; snapshot(); armGiveUp() })
  // Ends the whole tree while the child is ALIVE. (After it has exited by itself no pid is killed: it might belong to another process by now.)
  const endChild = reason => {
    if (killedBy || exited) return
    killedBy = reason
    snapshot()
    kill(pid)
    armGiveUp()
  }
  proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8')
  const take = chunk => {
    if (bytes < maxBytes) { text += chunk; bytes += Buffer.byteLength(chunk) } else truncated = true
    if (!sawEnd && endMarkers.some(m => text.includes(m))) {
      sawEnd = true
      // the block is in: the child gets a moment to finish by itself, then its whole tree is ended
      setTimeout(() => endChild('after-summary'), graceMs)
    }
  }
  proc.stdout.on('data', take)
  proc.stderr.on('data', take)
  const limit = setTimeout(() => endChild('time-limit'), timeLimitMs)
  await done
  clearTimeout(limit)
  await new Promise(r => setTimeout(r, 100))
  const stillAlive = pid && !exited ? alive(pid) : false
  // survivors: descendants seen while the tree was known that are still alive now. pipesOpen: the child is gone but something still holds its output pipes.
  // A process that is merely slow to go away (a worker or the esbuild service tearing down) is given up to 2 s before it is reported.
  let left = [...seen.keys()].filter(p => alive(p))
  for (let waited = 0; left.length && waited < 2_000; waited += 200) { await new Promise(r => setTimeout(r, 200)); left = left.filter(p => alive(p)) }
  const survivors = left
  const survivorNames = Object.fromEntries(left.map(p => [p, seen.get(p)]))
  return { text, truncated, exitCode, killedBy, stillAlive, pipesOpen: !closed, survivors, survivorNames, pid, ms: now() - started }
}

/**
 * The whole launcher. `print` receives ONLY filtered text. Returns the exit code the CLI should use (0 only when a clean, accepted summary was printed).
 */
export async function runLauncher({ env, repoRoot, plumbingCheck = false, print, child, graceMs, timeLimitMs, nonce = randomBytes(16).toString('hex'), writeFile = writeFileSync, makeDir = mkdirSync, run = runTrialChild }) {
  const refusals = launcherRefusals(env)
  if (refusals.length) { for (const r of refusals) print(`REFUSED: ${redactText(r, env)}`); return 2 }
  const childEnv = buildChildEnv(env, { confirm: !plumbingCheck, nonce })
  const spec = child ?? { file: process.execPath, args: [join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--project', 'app', 'scripts/uat/consultUat/liveTrial.test.ts', '--reporter=verbose', '--silent=false'] }
  const m = k => marker(k, nonce)
  const res = await run({ child: spec, cwd: repoRoot, env: childEnv, endMarkers: [m(SUMMARY_END), m(REFUSED_END)], graceMs, timeLimitMs })
  const redacted = redactText(res.text, env)
  // a redacted copy of the whole output, for the Owner (never for a transcript); written only for a results folder on drive D, and never in a plumbing check
  let logPath = null
  const outDir = env.BENCH_TRIAL_OUT_DIR
  if (!plumbingCheck && outDir && /^D:[\\/]/i.test(outDir)) {
    try { makeDir(outDir, { recursive: true }); logPath = join(outDir, `child-output-redacted-${Date.now()}.txt`); writeFile(logPath, redacted) } catch { logPath = null }
  }
  const summary = extractBlock(redacted, m(SUMMARY_BEGIN), m(SUMMARY_END))
  const refused = extractBlock(redacted, m(REFUSED_BEGIN), m(REFUSED_END))
  if (summary !== null) print(summary)
  if (refused !== null) print(`REFUSED (nothing was sent):\n${refused}`)
  if (summary === null && refused === null) print(plumbingCheck ? `plumbing check: the child ran and produced no trial block (exit code ${res.exitCode}), as expected without the confirmation` : `NO TRIAL SUMMARY was produced (child exit code ${res.exitCode}${res.killedBy ? `, ended by the launcher: ${res.killedBy}` : ''}). Do not run again; look at the redacted output file.`)
  print(`child process: ${res.stillAlive ? `STILL ALIVE (pid ${res.pid}) - end it by hand` : 'ended'}${res.killedBy ? ` (ended by the launcher: ${res.killedBy})` : ''}; ${res.ms} ms`)
  if (res.survivors && res.survivors.length) print(`WARNING: process(es) that belonged to the trial's tree are STILL RUNNING (pid ${res.survivors.map(p => `${p}${res.survivorNames && res.survivorNames[p] ? ` ${res.survivorNames[p]}` : ''}`).join(', ')}): check what they are, end them by hand if they belong to the trial (Task Manager) - they were not killed by pid because a pid can be reused`)
  if (res.pipesOpen) print('WARNING: the child process is gone but its output pipes did not close: a descendant process may be left running - check the Task Manager for node.exe and end it by hand')
  if (logPath) print(`redacted copy of the child output (for you, not for a transcript): ${redactText(logPath, env)}`)
  if (res.stillAlive || res.pipesOpen || (res.survivors && res.survivors.length)) return 3
  if (plumbingCheck) return res.exitCode === 0 ? 0 : 1
  return summary !== null && /turnOk=true/.test(summary) && /trialClean=true/.test(summary) && !/NOT CLEAN/.test(summary) ? 0 : 1
}

const samePath = (a, b) => {
  try { const x = realpathSync(a), y = realpathSync(b); return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y } catch { return false }
}
const here = dirname(fileURLToPath(import.meta.url))
if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || samePath(fileURLToPath(import.meta.url), process.argv[1]))) {
  const repoRoot = join(here, '..', '..', '..')
  if (!existsSync(join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'))) { console.log('REFUSED: node_modules/vitest/vitest.mjs not found'); process.exit(2) }
  const code = await runLauncher({ env: process.env, repoRoot, plumbingCheck: process.argv.includes('--plumbing-check'), print: s => console.log(s) })
  process.exit(code)
}
