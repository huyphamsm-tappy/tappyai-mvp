// Android e2e driver: adb + UI Automator hierarchy dumps. Every step can screenshot; every flow is
// screen-recorded. Text is matched against what the app actually renders (text / content-desc).
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { sessionFor } from './supabase.mjs'

const ADB = process.env.ADB || path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe')
export const SERIAL = process.env.E2E_SERIAL || 'emulator-5556'
export const PKG = 'com.tappyai.app.staging'
const MAIN = `${PKG}/com.tappyai.app.MainActivity`
const HOOK = `${PKG}/com.tappyai.app.uat.UatTestHookActivity`

/** Writes a file into the app's PRIVATE files/e2e dir (run-as works because the uat build is debuggable). */
function writePrivate(name, content) {
  const r = spawnSync(ADB, ['-s', SERIAL, 'shell', 'run-as', PKG, 'sh', '-c', `'mkdir -p files/e2e && cat > files/e2e/${name}'`], { input: content })
  if (r.status !== 0) throw new Error('run-as write failed: ' + (r.stderr || '').toString().slice(0, 200))
}

export function adb(args, opts = {}) {
  const r = spawnSync(ADB, ['-s', SERIAL, ...args], { encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 64 << 20 })
  if (r.status !== 0 && !opts.allowFail) throw new Error(`adb ${args.slice(0, 3).join(' ')} failed: ${(r.stderr || '').toString().slice(0, 200)}`)
  return r.stdout
}
export const sh = (...a) => adb(['shell', ...a])
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── hierarchy ────────────────────────────────────────────────────────────────
export function dump() {
  for (let i = 0; i < 3; i++) {
    const out = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], { allowFail: true }) || ''
    const xml = out.slice(out.indexOf('<?xml'), out.lastIndexOf('</hierarchy>') + 12)
    if (xml.length > 20) return parseNodes(xml)
  }
  return []
}
function unescape(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
function parseNodes(xml) {
  const nodes = []
  for (const m of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
    const a = {}
    for (const kv of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) a[kv[1]] = unescape(kv[2])
    const b = a.bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
    if (!b) continue
    nodes.push({ text: a.text || '', desc: a['content-desc'] || '', res: a['resource-id'] || '', clickable: a.clickable === 'true', x1: +b[1], y1: +b[2], x2: +b[3], y2: +b[4] })
  }
  return nodes
}
const matches = (n, q) => (q instanceof RegExp ? q.test(n.text) || q.test(n.desc) || q.test(n.res) : n.text === q || n.desc === q || n.res === q || n.res.endsWith(':id/' + q))
export const find = (q, nodes = dump()) => nodes.find((n) => matches(n, q) && n.x2 > n.x1 && n.y2 > n.y1)
export const texts = (nodes = dump()) => nodes.map((n) => n.text || n.desc).filter(Boolean)
export const visible = (q) => !!find(q)
/** Portrait grid tiles (profile / collection grids): clickable, ~1/3 of the width, taller than wide. */
export const tiles = (nodes = dump()) => nodes.filter((n) => n.clickable && n.x2 - n.x1 > 250 && n.x2 - n.x1 < 420 && n.y2 - n.y1 > 400 && n.y1 > 300)

export async function waitFor(q, { timeout = 20000, interval = 800 } = {}) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const n = find(q)
    if (n) return n
    await sleep(interval)
  }
  throw new Error(`timeout waiting for ${q}`)
}
export async function waitGone(q, { timeout = 60000 } = {}) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (!find(q)) return; await sleep(1000) }
  throw new Error(`still visible after ${timeout}ms: ${q}`)
}

// ── input ────────────────────────────────────────────────────────────────────
export const tapXY = (x, y) => sh('input', 'tap', String(Math.round(x)), String(Math.round(y)))
export async function tap(q, opts) {
  const n = typeof q === 'object' && 'x1' in q ? q : await waitFor(q, opts)
  tapXY((n.x1 + n.x2) / 2, (n.y1 + n.y2) / 2)
  await sleep(opts?.after ?? 1200)
  return n
}
export async function scrollTo(q, { max = 8 } = {}) {
  // Down first (content above the fold), then up — a screen may come back with its old scroll.
  for (const dir of ['down', 'up']) {
    for (let i = 0; i < max; i++) {
      const n = find(q)
      if (n && n.y2 < 2050 && n.y1 > 200) return n
      if (dir === 'down' && i >= 3) break
      swipe(dir)
      await sleep(900)
    }
  }
  throw new Error(`could not scroll to ${q}`)
}
/**
 * Scrolls a horizontal row until [q] is fully on screen. [rowQ] finds ANY node of the row (re-found
 * every step, since the page may shift); swipes run between x=[from] and x=[to] inside the row.
 */
export async function scrollRowTo(q, rowQ, { max = 6, from = 650, to = 120 } = {}) {
  for (const dir of ['right', 'left']) {
    for (let i = 0; i < max; i++) {
      const nodes = dump()
      const n = find(q, nodes)
      if (n && n.x1 >= 60 && n.x2 <= 1020 && n.x2 - n.x1 > 40) return n
      const row = find(rowQ, nodes)
      if (!row) throw new Error(`row not on screen for ${q}`)
      const y = String(Math.round((row.y1 + row.y2) / 2))
      // "right" reveals the START of the row (content moves right), "left" its end.
      if (dir === 'left') sh('input', 'swipe', String(from), y, String(to), y, '400'); else sh('input', 'swipe', String(to), y, String(from), y, '400')
      await sleep(800)
    }
  }
  throw new Error(`could not scroll the row to ${q}`)
}
export function swipe(dir = 'up') {
  const [a, b] = dir === 'up' ? [1750, 700] : [700, 1750]
  sh('input', 'swipe', '540', String(a), '540', String(b), '450')
}
export const back = async () => { sh('input', 'keyevent', '4'); await sleep(1500) }
export const typeAscii = (s) => sh('input', 'text', s.replace(/ /g, '%s'))

/** Vietnamese text: through the uat hook's clipboard, then Paste (adb `input text` cannot type it). */
export async function pasteText(text) {
  writePrivate('clip.txt', Buffer.from(text, 'utf8'))
  sh('am', 'start', '-n', HOOK, '--es', 'op', 'clip')
  await sleep(1500)
  sh('input', 'keyevent', '279') // KEYCODE_PASTE into the focused field
  await sleep(700)
}

// ── app lifecycle ────────────────────────────────────────────────────────────
export function foreground() {
  const out = sh('dumpsys', 'activity', 'activities')
  return (out.match(/topResumedActivity=ActivityRecord\{\S+ \S+ (\S+)/) || [])[1] || ''
}
export async function launch({ fresh = false } = {}) {
  if (fresh) sh('am', 'force-stop', PKG)
  sh('am', 'start', '-W', '-n', MAIN)
  // A first start after install can take ~20 s on the emulator; wait for the shell's bottom bar.
  // The software-GPU emulator sometimes raises "isn't responding" on that first frame (main thread
  // in text drawing, not blocked — see ANDROID-PROGRESS §ANR); answer "Wait", never "Close app".
  const end = Date.now() + 90000
  while (Date.now() < end) {
    const nodes = dump()
    if (find('Trang chủ', nodes) && !find(/isn.t responding/, nodes)) break
    const wait = find('Wait', nodes)
    if (wait && find(/isn.t responding/, nodes)) { tapXY((wait.x1 + wait.x2) / 2, (wait.y1 + wait.y2) / 2); console.log('    (emulator ANR dialog → Wait)') }
    await sleep(1500)
  }
  await sleep(1000)
}
export function install(apk) { adb(['install', '-r', apk]) }

/**
 * Signs the app in as a seeded AUDIT account without any UI typing (uat hook), then VERIFIES it:
 * the Tôi hub must show that account's email. Retries once (a slow first frame can swallow it).
 */
export async function signIn(email) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const s = await sessionFor(email)
    writePrivate('session.json', JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }))
    await launch()
    sh('am', 'start', '-n', HOOK, '--es', 'op', 'session')
    await sleep(6000)
    sh('am', 'force-stop', PKG)
    await launch()
    await tap('Tôi', { after: 4000 }).catch(() => {})
    const ok = !!find(email)
    await tap('Trang chủ', { after: 1500 }).catch(() => {})
    if (ok) return
    console.log(`    (sign-in as ${email} not visible yet — attempt ${attempt})`)
  }
  throw new Error(`could not sign in as ${email}`)
}
export async function signOut() {
  sh('am', 'start', '-n', HOOK, '--es', 'op', 'signout')
  await sleep(4000)
}

// ── evidence ─────────────────────────────────────────────────────────────────
export class Recorder {
  constructor(dir) { this.dir = dir; this.step = 0; this.proc = null; this.part = 0; fs.mkdirSync(dir, { recursive: true }) }
  shot(name) {
    const png = adb(['exec-out', 'screencap', '-p'], { binary: true })
    const file = path.join(this.dir, `${String(++this.step).padStart(2, '0')}-${name}.png`)
    fs.writeFileSync(file, png)
    return file
  }
  /** screenrecord caps at 180 s, so a flow records in consecutive parts until stopVideo(). */
  startVideo() {
    this.stopped = false
    const next = () => {
      const remote = `/sdcard/e2e-part-${this.part}.mp4`
      this.remotes = [...(this.remotes || []), remote]
      this.proc = spawn(ADB, ['-s', SERIAL, 'shell', 'screenrecord', '--time-limit', '175', '--size', '540x1200', '--bit-rate', '1500000', remote], { stdio: 'ignore' })
      this.proc.on('exit', () => { if (!this.stopped) { this.part++; next() } })
    }
    next()
  }
  async stopVideo() {
    if (this.stopped !== false) return
    this.stopped = true
    adb(['shell', 'pkill', '-INT', 'screenrecord'], { allowFail: true })
    await sleep(3000)
    ;(this.remotes || []).forEach((remote, i) => {
      adb(['pull', remote, path.join(this.dir, `video-${i}.mp4`)], { allowFail: true })
      adb(['shell', 'rm', '-f', remote], { allowFail: true })
    })
    this.remotes = []
  }
}
