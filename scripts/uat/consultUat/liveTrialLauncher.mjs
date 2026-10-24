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
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The markers around the blocks the child prints. They carry the run's nonce: `<<TRIAL-SUMMARY-BEGIN:<nonce>>>`. */
export const marker = (kind, nonce) => `<<TRIAL-${kind}:${nonce}>>`
export const SUMMARY_BEGIN = 'SUMMARY-BEGIN', SUMMARY_END = 'SUMMARY-END', REFUSED_BEGIN = 'REFUSED-BEGIN', REFUSED_END = 'REFUSED-END'
/** Round 3f: the preflight report block (conditions ĐẠT / KHÔNG ĐẠT). Printed by a child run with BENCH_TRIAL_PREFLIGHT_ONLY=1, which sends nothing. */
export const PREFLIGHT_BEGIN = 'PREFLIGHT-BEGIN', PREFLIGHT_END = 'PREFLIGHT-END'
/** Round 3f · Gate 1: the one line the Owner types, by hand, before the first request of a real run. Compared exactly. */
export const GATE1_LINE = 'CHẠY LƯỢT ĐO D8 D2 TRẦN 0.10'

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
  // round 3c: 'dev-multi' runs the development turns of the question file in one process (liveTrial.test.ts); unset = one question as before
  'BENCH_TRIAL_MODE',
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
  // round 3h: a bare buy verb offers shopping instead of forcing search_products (intent.ts routeToolOfferOn); default OFF
  'ROUTE_TOOL_OFFER_GUARD',
  // round closure: the Serper REQUEST cap (serperRequestCap.ts); default OFF. A paid run refuses to start unless all three are armed
  'CONSULT_REQUEST_CAP', 'CONSULT_REQUEST_CAP_PER_TURN', 'CONSULT_REQUEST_CAP_PER_RUN',
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
    if (v && v.length >= 4) out = out.replace(new RegExp(escapeRegExp(v), 'gi'), '***') // any value of 4+ characters: a short key echoed by a child must not reach the output
  }
  return out.replace(/\bsk-[A-Za-z0-9_*.-]{4,}/g, 'sk-***')
}

/** The child's environment: ONLY the allow-listed names that the parent has set, plus the two markers the launcher sets itself. Pure. */
export function buildChildEnv(parentEnv, { confirm, nonce, preflightOnly = false }) {
  const out = {}
  for (const [k, v] of Object.entries(parentEnv)) {
    if (v === undefined) continue
    if (isAllowedName(k)) out[k] = v
  }
  out.BENCH_TRIAL_ISOLATED = nonce
  if (confirm) out.BENCH_LIVE_TRIAL = 'I-UNDERSTAND-THIS-SPENDS-REAL-MONEY'
  // the preflight-only child prints its condition report and stops before the trial: it sends nothing (liveTrial.test.ts)
  if (preflightOnly) out.BENCH_TRIAL_PREFLIGHT_ONLY = '1'
  return out
}

/** Reasons the launcher itself will not start (the child's own preflight does the authoritative checks and reports its reasons in the refused block). Pure. */
export function launcherRefusals(parentEnv) {
  const reasons = []
  if ((parentEnv.CI ?? '') !== '') reasons.push('CI is set: the live trial never runs in CI')
  if (parentEnv.BENCH_LIVE_TRIAL !== undefined) reasons.push('BENCH_LIVE_TRIAL is set in this shell: the launcher sets it itself, for the child only - remove it from the shell')
  if (parentEnv.BENCH_TRIAL_ISOLATED !== undefined) reasons.push('BENCH_TRIAL_ISOLATED is set in this shell: the launcher sets it itself, for the child only - remove it from the shell')
  if (parentEnv.BENCH_TRIAL_PREFLIGHT_ONLY !== undefined) reasons.push('BENCH_TRIAL_PREFLIGHT_ONLY is set in this shell: the launcher sets it itself, for the preflight child only - remove it from the shell')
  for (const k of Object.keys(parentEnv)) {
    if (parentEnv[k] !== undefined && LOOKS_LIKE_A_SETTING.test(k) && !isAllowedName(k) && k !== 'BENCH_LIVE_TRIAL' && k !== 'BENCH_TRIAL_ISOLATED' && k !== 'BENCH_TRIAL_PREFLIGHT_ONLY') {
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
export async function runLauncher({ env, repoRoot, plumbingCheck = false, preflightOnly = false, print, child, graceMs, timeLimitMs, nonce = randomBytes(16).toString('hex'), writeFile = writeFileSync, makeDir = mkdirSync, run = runTrialChild }) {
  const refusals = launcherRefusals(env)
  if (refusals.length) { for (const r of refusals) print(`REFUSED: ${redactText(r, env)}`); return 2 }
  const childEnv = buildChildEnv(env, { confirm: !plumbingCheck, nonce, preflightOnly })
  const spec = child ?? { file: process.execPath, args: [join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--project', 'app', 'scripts/uat/consultUat/liveTrial.test.ts', '--reporter=verbose', '--silent=false'] }
  const m = k => marker(k, nonce)
  const res = await run({ child: spec, cwd: repoRoot, env: childEnv, endMarkers: [m(SUMMARY_END), m(REFUSED_END), m(PREFLIGHT_END)], graceMs, timeLimitMs })
  const redacted = redactText(res.text, env)
  // a redacted copy of the whole output, for the Owner (never for a transcript); written only for a results folder on drive D, and never in a plumbing check
  let logPath = null
  const outDir = env.BENCH_TRIAL_OUT_DIR
  if (!plumbingCheck && outDir && /^D:[\\/]/i.test(outDir)) {
    try { makeDir(outDir, { recursive: true }); logPath = join(outDir, `child-output-redacted-${Date.now()}.txt`); writeFile(logPath, redacted) } catch { logPath = null }
  }
  const summary = extractBlock(redacted, m(SUMMARY_BEGIN), m(SUMMARY_END))
  const refused = extractBlock(redacted, m(REFUSED_BEGIN), m(REFUSED_END))
  const preflight = extractBlock(redacted, m(PREFLIGHT_BEGIN), m(PREFLIGHT_END))
  if (preflightOnly) {
    // the preflight child sends nothing; its block lists every condition. Only a block with no KHÔNG ĐẠT line and the all-clear total is a pass.
    if (preflight !== null) print(preflight)
    else print(`PREFLIGHT: the child produced no condition report (child exit code ${res.exitCode}${res.killedBy ? `, ended by the launcher: ${res.killedBy}` : ''}). Nothing was sent.`)
  }
  if (summary !== null) print(summary)
  if (refused !== null) print(`REFUSED (nothing was sent):\n${refused}`)
  if (summary === null && refused === null && !preflightOnly) print(plumbingCheck ? `plumbing check: the child ran and produced no trial block (exit code ${res.exitCode}). This exit code does NOT prove the configuration: the trial test is skipped without the confirmation. Use --preflight-only to check the configuration (it sends nothing).` : `NO TRIAL SUMMARY was produced (child exit code ${res.exitCode}${res.killedBy ? `, ended by the launcher: ${res.killedBy}` : ''}). Do not run again; look at the redacted output file.`)
  print(`child process: ${res.stillAlive ? `STILL ALIVE (pid ${res.pid}) - end it by hand` : 'ended'}${res.killedBy ? ` (ended by the launcher: ${res.killedBy})` : ''}; ${res.ms} ms`)
  if (res.survivors && res.survivors.length) print(`WARNING: process(es) that belonged to the trial's tree are STILL RUNNING (pid ${res.survivors.map(p => `${p}${res.survivorNames && res.survivorNames[p] ? ` ${res.survivorNames[p]}` : ''}`).join(', ')}): check what they are, end them by hand if they belong to the trial (Task Manager) - they were not killed by pid because a pid can be reused`)
  if (res.pipesOpen) print('WARNING: the child process is gone but its output pipes did not close: a descendant process may be left running - check the Task Manager for node.exe and end it by hand')
  if (logPath) print(`redacted copy of the child output (for you, not for a transcript): ${redactText(logPath, env)}`)
  if (res.stillAlive || res.pipesOpen || (res.survivors && res.survivors.length)) return 3
  // The preflight child prints its block and then stays alive (vitest does not exit at once): the launcher ends it after the block (killedBy
  // 'after-summary'), so a clean block is accepted with or without a zero exit code. A time-limit kill is not accepted.
  const childDone = res.exitCode === 0 || res.killedBy === 'after-summary'
  if (preflightOnly) return preflight !== null && childDone && /TỔNG: mọi điều kiện ĐẠT/.test(preflight) && !/KHÔNG ĐẠT/.test(preflight) ? 0 : 1
  if (plumbingCheck) return res.exitCode === 0 ? 0 : 1
  // a real run is clean only if its summary is complete AND the child was not cut short by the time limit (a kill is never a clean result)
  return summary !== null && /turnOk=true/.test(summary) && /trialClean=true/.test(summary) && !/NOT CLEAN/.test(summary) && res.killedBy !== 'time-limit' ? 0 : 1
}

/**
 * Round 3f · hidden input for a key. Needs a terminal; the typed characters are never echoed and never written anywhere. The value goes back to the
 * caller only. Ctrl+C cancels (nothing is read further). Control characters are built with String.fromCharCode (no escape sequences in source).
 */
export function readHidden(prompt, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') return Promise.reject(new Error('hidden input needs an interactive terminal (nothing was read)'))
  const CR = String.fromCharCode(13), LF = String.fromCharCode(10), ETX = String.fromCharCode(3), DEL = String.fromCharCode(127), BS = String.fromCharCode(8)
  return new Promise((resolve, reject) => {
    let buf = ''
    const finish = (err, value) => {
      input.removeListener('data', onData)
      input.setRawMode(false)
      input.pause()
      output.write('\n')
      if (err) reject(err); else resolve(value)
    }
    const onData = chunk => {
      for (const ch of String(chunk)) {
        if (ch === CR || ch === LF) return finish(null, buf)
        if (ch === ETX) return finish(new Error('cancelled by Ctrl+C (nothing was sent)'), '')
        if (ch === DEL || ch === BS) { buf = buf.slice(0, -1); continue }
        buf += ch
      }
    }
    output.write(prompt)
    input.setRawMode(true)
    input.resume()
    input.on('data', onData)
  })
}

/** Round 3f · a typed line (Gate 1). Times out to '' (which is refused). The line is shown as typed; it is not a secret. */
export function askLine(prompt, { input = process.stdin, output = process.stdout, timeoutMs = 300_000 } = {}) {
  return new Promise(resolve => {
    const rl = createInterface({ input, output, terminal: true })
    const timer = setTimeout(() => { rl.close(); resolve('') }, timeoutMs)
    // end of input (stdin closed) ends the wait at once: '' is refused by the caller
    rl.on('close', () => { clearTimeout(timer); resolve('') })
    // the answer is resolved BEFORE the interface closes: rl.close() emits 'close' synchronously, which would otherwise resolve '' first
    rl.question(prompt, answer => { clearTimeout(timer); resolve(answer); rl.close() })
  })
}

/** Round 3f · Gate 1 summary: what the run will do, with no key value. Pure. */
export function gate1Summary(env, questionText) {
  const lines = [
    '--- Gate 1: tóm tắt trước lần gửi request đầu tiên (không có giá trị khóa) ---',
    `BENCH_TRIAL_MODE=${env.BENCH_TRIAL_MODE ?? '(unset)'}`,
    `caps: lượt ${env.BENCH_SPEND_TURN_CAP_USD ?? '?'} USD, tổng ${env.BENCH_SPEND_RUN_CAP_USD ?? '?'} USD, BENCH_CONFIRM_SPEND=${env.BENCH_CONFIRM_SPEND ?? '?'}`,
    `chế độ ngân sách: ${env.BENCH_TRIAL_MODE === 'dev-multi' ? 'extension (bộ mở rộng; tối đa 1.75 USD/lần chạy)' : 'acceptance (nghiệm thu; tối đa 0.65 USD/lần chạy)'}, tối đa 0.05 USD/lượt ở mọi chế độ`,
    `trần request Serper (đếm request, KHÔNG phải tiền): CONSULT_REQUEST_CAP=${env.CONSULT_REQUEST_CAP ?? '(unset)'}, mỗi lượt ${env.CONSULT_REQUEST_CAP_PER_TURN ?? '?'}, cả lần chạy ${env.CONSULT_REQUEST_CAP_PER_RUN ?? '?'}`,
    `khóa: OPENAI_API_KEY ${(env.OPENAI_API_KEY ?? '') !== '' ? 'SET' : 'UNSET'}, SERPER_API_KEY ${(env.SERPER_API_KEY ?? '') !== '' ? 'SET' : 'UNSET'}`,
  ]
  if (questionText === null) lines.push('lượt: tệp câu hỏi không đọc được')
  else {
    const turns = questionText.split(/\r?\n/).filter(l => l.trim() !== '').map(l => l.split('|').slice(0, 3).join('|'))
    lines.push(`lượt (id|hội thoại|lượt): ${turns.join('  ')}`)
  }
  lines.push(`Gõ đúng dòng sau để gửi request đầu tiên: ${GATE1_LINE}`)
  return lines
}

/**
 * Round 3f · the whole real flow, in order: (0) preflight-only child: every condition must be ĐẠT, nothing is sent; (1) Gate 1: an interactive
 * terminal and the typed line, exact; (2) only then the real run. `keys` are merged into the CHILD environment only (a fresh object): process.env of
 * this launcher is never changed. Returns the exit code of the step that ended the flow.
 */
export async function runFlow({ env, repoRoot, keys = {}, print, child, run, nonce, questionText = null, stdinIsTTY = process.stdin.isTTY === true, askGate1 = p => askLine(p), graceMs, timeLimitMs, writeFile, makeDir }) {
  const full = { ...env, ...keys }
  const common = { env: full, repoRoot, print, child, run, graceMs, timeLimitMs, writeFile, makeDir }
  // each child gets its own random nonce (32 hex, as the test file requires); the test may pin the real run's nonce
  const pre = await runLauncher({ ...common, preflightOnly: true })
  if (pre !== 0) { print('Gate 0 not passed: nothing was sent.'); return pre }
  if (!stdinIsTTY) { print('REFUSED: Gate 1 needs an interactive terminal; nothing was sent.'); return 2 }
  for (const line of gate1Summary(full, questionText)) print(line)
  // both sides in NFC (some input methods type NFD); a trailing carriage return from the terminal is dropped; nothing else is forgiven
  const answer = (await askGate1(`> `)).replace(/\r$/, '').normalize('NFC')
  if (answer !== GATE1_LINE.normalize('NFC')) { print('Gate 1 not confirmed (the line did not match exactly): nothing was sent.'); return 1 }
  return runLauncher({ ...common, nonce })
}

const samePath = (a, b) => {
  try { const x = realpathSync(a), y = realpathSync(b); return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y } catch { return false }
}
const here = dirname(fileURLToPath(import.meta.url))
if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || samePath(fileURLToPath(import.meta.url), process.argv[1]))) {
  const repoRoot = join(here, '..', '..', '..')
  if (!existsSync(join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'))) { console.log('REFUSED: node_modules/vitest/vitest.mjs not found'); process.exit(2) }
  const argv = process.argv.slice(2)
  const print = s => console.log(s)
  // keys are read by hand, here, only when asked for (--prompt-keys) and only when the shell does not already hold them. They go to the child, never to process.env.
  const keys = {}
  if (argv.includes('--prompt-keys')) {
    for (const name of ['OPENAI_API_KEY', 'SERPER_API_KEY']) {
      if ((process.env[name] ?? '') !== '') { print(`${name}: SET in this shell (value not shown). Prefer a fresh PowerShell and --prompt-keys.`); continue }
      try { keys[name] = await readHidden(`${name} (nhập ẩn, không hiện): `) } catch (e) { print(`REFUSED: ${e.message}`); process.exit(2) }
    }
  }
  let questionText = null
  try { questionText = readFileSync((process.env.BENCH_TRIAL_QUESTION_FILE ?? '').trim(), 'utf8') } catch { questionText = null }
  let code
  if (argv.includes('--plumbing-check')) code = await runLauncher({ env: process.env, repoRoot, plumbingCheck: true, print })
  else if (argv.includes('--preflight-only')) code = await runLauncher({ env: { ...process.env, ...keys }, repoRoot, preflightOnly: true, print })
  else code = await runFlow({ env: process.env, repoRoot, keys, print, questionText })
  // the launcher's own references to the keys are dropped before exit. JavaScript cannot zero a string in memory: that limit is stated, not hidden.
  for (const k of Object.keys(keys)) delete keys[k]
  process.exit(code)
}
