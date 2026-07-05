#!/usr/bin/env node
/**
 * dev-reset — restore a clean local development environment with one command.
 *
 *   npm run dev:reset          # stop → clean → verify deps → fresh server → health check → stop
 *   npm run dev:reset -- --keep # ...but leave the verified dev server running for you to use
 *
 * Cross-platform (Windows / macOS / Linux), pure Node — no extra dependencies.
 * Requires Node 18+ (uses the built-in global fetch).
 *
 * SAFETY: this only ever stops the process LISTENING on the dev port, deletes
 * the two build caches (.next, node_modules/.cache), and reinstalls deps ONLY
 * when real corruption is detected. It never touches node_modules (beyond its
 * cache), package-lock.json, git files, env files, or any application code.
 */
import { spawn, execSync } from 'node:child_process'
import { rmSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.PORT) || 3000
const KEEP = process.argv.includes('--keep')
const ROOT = process.cwd()
const isWin = process.platform === 'win32'
const npmCmd = isWin ? 'npm.cmd' : 'npm'

const c = { cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m', reset: '\x1b[0m' }
const step = (n, m) => console.log(`\n${c.cyan}[dev:reset ${n}]${c.reset} ${m}`)
const ok = (m) => console.log(`  ${c.green}✓${c.reset} ${m}`)
const warn = (m) => console.log(`  ${c.yellow}!${c.reset} ${m}`)
const bad = (m) => console.log(`  ${c.red}✗${c.reset} ${m}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Find + stop only the process(es) listening on the dev port. Never touches unrelated apps. */
function stopPort(port) {
  try {
    const pids = new Set()
    if (isWin) {
      let out = ''
      try { out = execSync('netstat -ano -p tcp', { encoding: 'utf8' }) } catch { return }
      for (const line of out.split('\n')) {
        const p = line.trim().split(/\s+/) // Proto  Local  Foreign  State  PID
        if (p[0] === 'TCP' && p[1]?.endsWith(`:${port}`) && p[3] === 'LISTENING' && /^\d+$/.test(p[4]) && p[4] !== '0') pids.add(p[4])
      }
      for (const pid of pids) { try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }) } catch {} }
    } else {
      let out = ''
      try { out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }) } catch { /* nothing listening */ }
      for (const pid of out.split('\n').map((s) => s.trim()).filter(Boolean)) { pids.add(pid); try { execSync(`kill -9 ${pid}`) } catch {} }
    }
    if (pids.size) ok(`stopped process on :${port} (PID ${[...pids].join(', ')})`)
    else ok(`no process listening on :${port}`)
  } catch (e) { warn(`port cleanup skipped: ${e.message}`) }
}

/** Fetch with a hard timeout so a hung server can never wedge the script. */
async function fetchT(url, ms = 60000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { signal: ctrl.signal }) } finally { clearTimeout(t) }
}

async function main() {
  console.log(`${c.dim}dev:reset — clean local environment (port ${PORT}${KEEP ? ', --keep' : ''})${c.reset}`)

  // ── STEP 1: stop running dev processes (port-scoped) ──
  step(1, 'Stopping dev processes')
  stopPort(PORT)

  // ── STEP 2: clean build caches (nothing else) ──
  step(2, 'Cleaning caches')
  for (const rel of ['.next', join('node_modules', '.cache')]) {
    const p = join(ROOT, rel)
    if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); ok(`removed ${rel}`) }
    else ok(`${rel} already absent`)
  }

  // ── STEP 3: verify dependencies (reinstall ONLY on real corruption) ──
  step(3, 'Verifying dependencies')
  let needInstall = false
  const nm = join(ROOT, 'node_modules')
  if (!existsSync(nm) || readdirSync(nm).length === 0) { needInstall = true; warn('node_modules missing/empty') }
  else if (!existsSync(join(ROOT, 'package-lock.json'))) { warn('package-lock.json missing (skipping lock check)') }
  else {
    try { execSync('npm ls --depth=0', { cwd: ROOT, stdio: 'pipe' }); ok('dependency tree OK') }
    catch (e) {
      const out = `${e.stdout || ''}${e.stderr || ''}`
      if (/\b(missing|invalid|UNMET)\b/i.test(out)) { needInstall = true; warn('dependency corruption detected') }
      else ok('dependency tree OK (peer warnings ignored)')
    }
  }
  if (needInstall) { warn('reinstalling dependencies…'); execSync('npm install', { cwd: ROOT, stdio: 'inherit' }); ok('dependencies reinstalled') }
  else ok('no reinstall needed')

  // ── STEP 4: start a fresh dev server ──
  step(4, 'Starting fresh dev server')
  // Windows + Node 18.20/20.12/22+ reject spawning .cmd shims without a shell (CVE-2024-27980),
  // so run through the shell on Windows (command as one string → no DEP0190 arg-escaping warning).
  // On POSIX, spawn the binary directly for clean signal handling.
  const spawnOpts = { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] }
  const child = isWin
    ? spawn('npm run dev', { ...spawnOpts, shell: true })
    : spawn(npmCmd, ['run', 'dev'], spawnOpts)
  let serverLog = ''
  let serverErrored = false
  const errorRe = /(Failed to compile|Unhandled(?:Promise)?Rejection|⨯|Error:\s|hydrat\w*\s+(?:mismatch|error))/i
  const onData = (d) => { const s = d.toString(); serverLog += s; if (errorRe.test(s)) serverErrored = true }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  child.on('exit', (code) => { if (code && code !== 0 && !KEEP) { /* recorded via health */ } })

  // wait until it responds (routes compile lazily on first hit)
  let up = false
  const start = Date.now()
  while (Date.now() - start < 90000) {
    try { const r = await fetchT(`http://localhost:${PORT}/`, 10000); if (r.status < 500) { up = true; break } } catch { /* not ready */ }
    if (child.exitCode !== null) break
    await sleep(1000)
  }
  const readyMatch = serverLog.match(/Ready in\s+([\d.]+\s*m?s)/i)
  if (up) ok(`server up${readyMatch ? ` (${readyMatch[1]})` : ''}`)
  else { bad('server did not become ready within 90s'); dumpTail(serverLog); return finish(child, false) }

  // ── STEP 5: lightweight health check ──
  step(5, 'Health check')
  let healthy = true
  const routes = [['/', 'Home'], ['/chat', 'Chat'], ['/reviews', 'Reviews']]
  for (const [path, name] of routes) {
    try {
      const r = await fetchT(`http://localhost:${PORT}${path}`)
      const body = await r.text()
      if (r.ok && /TappyAI/i.test(body)) ok(`${name} loads (${r.status})`)
      else { bad(`${name} unhealthy (status ${r.status}${/TappyAI/i.test(body) ? '' : ', marker missing'})`); healthy = false }
    } catch (e) { bad(`${name} failed: ${e.message}`); healthy = false }
  }
  try {
    const r = await fetchT(`http://localhost:${PORT}/api/suggested-prompts`)
    if (r.ok) ok(`API /api/suggested-prompts responds (${r.status})`)
    else { bad(`API /api/suggested-prompts unhealthy (${r.status})`); healthy = false }
  } catch (e) { bad(`API failed: ${e.message}`); healthy = false }
  if (serverErrored) { bad('server-side errors detected in dev output'); dumpTail(serverLog); healthy = false }
  else ok('no server errors in dev output')

  return finish(child, healthy)
}

function dumpTail(log) {
  const tail = log.split('\n').filter(Boolean).slice(-12).join('\n')
  if (tail) console.log(`${c.dim}  --- last dev output ---\n${tail}${c.reset}`)
}

function finish(child, healthy) {
  if (KEEP && healthy) {
    console.log(`\n${c.green}✔ Environment reset & verified — dev server left running on :${PORT}.${c.reset}`)
    child.unref() // detach so this process can exit while the server keeps running
    process.exit(0)
  }
  // default: stop the server we started (kill tree via the port to catch next's workers)
  try { child.kill() } catch {}
  stopPort(PORT)
  if (healthy) console.log(`\n${c.green}✔ Environment reset & verified healthy. Run \`npm run dev\` to start developing.${c.reset}`)
  else console.log(`\n${c.red}✗ Reset ran, but the health check FAILED — see output above.${c.reset}`)
  process.exit(healthy ? 0 : 1)
}

main().catch((e) => { console.error(`${c.red}dev:reset crashed:${c.reset}`, e); stopPort(PORT); process.exit(1) })
