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
/** BACK only when the soft keyboard is up — a BACK with no keyboard would leave the screen. */
export async function hideKeyboard() {
  // The window manager's mImeShowing is the truth; input_method's mInputShown was seen stale (true
  // with no keyboard on screen), and a BACK then left the chat for Trang chủ.
  if (/mImeShowing=true/.test(sh('dumpsys', 'window'))) { sh('input', 'keyevent', '4'); await sleep(600) }
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
  // After a foreign app (Maps/Chrome) was force-stopped the emulator sometimes leaves the launcher on
  // top: start the app once more if it is not in front a few seconds later.
  await sleep(3000)
  if (!foreground().startsWith(PKG + '/')) { sh('am', 'start', '-n', MAIN); await sleep(2000) }
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
/**
 * The system photo picker / share chooser run as their OWN task and survive force-stopping the app
 * (they come back on top of it). Back out of anything that isn't the app, then kill the picker.
 */
export async function dismissForeign() {
  for (let i = 0; i < 5; i++) {
    // Another app (e.g. Maps opened by a link) hanging on the software-GPU emulator: close IT —
    // it is not ours. (Our own app's ANR is answered "Wait" in launch().)
    const nodes = dump()
    if (find(/isn.t responding/, nodes) && !find(/^TappyAI/, nodes)) {
      const close = find('Close app', nodes)
      if (close) { tapXY((close.x1 + close.x2) / 2, (close.y1 + close.y2) / 2); await sleep(1500) }
    }
    const top = foreground()
    if (!top || top.startsWith(PKG + '/') || /launcher/i.test(top)) break
    sh('input', 'keyevent', '4'); await sleep(800)
  }
  for (const p of ['com.google.android.providers.media.module', 'com.google.android.apps.maps', 'com.android.chrome']) sh('am', 'force-stop', p)
  sh('input', 'keyevent', '3'); await sleep(500)
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
    // A leftover picker / chooser from an earlier flow sits on top of the app's task: start clean.
    await dismissForeign()
    await launch({ fresh: true })
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
/**
 * A REAL login transition for an account whose first screen is onboarding: from a guest, open the
 * Login screen (Tôi → a locked "Cần đăng nhập" row), then complete the sign-in through the hook while
 * Login is on screen — the app gates onboarding only there, like the web's auth callback. No wait
 * for Trang chủ.
 */
export async function signInFromLogin(email) {
  await signOut()
  await tap('Tôi', { after: 3000 })
  await scrollTo('Tài khoản')
  await tap('Tài khoản', { after: 3500 })
  const s = await sessionFor(email)
  writePrivate('session.json', JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }))
  sh('am', 'start', '-n', HOOK, '--es', 'op', 'session')
  await sleep(4000)
}
/** Back to a GUEST: wipe the app's data (a fresh install's state), then launch and let it mint a guest session. */
export async function signOut() {
  sh('pm', 'clear', PKG)
  sh('pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS')
  await launch()
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

// ── share targets (stand-in Zalo / TikTok / Messenger from android/e2e/share-stub) ──────────────
const STUB_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../share-stub/build/outputs/apk')
export function installShareStubs() {
  for (const f of ['zalo', 'tiktok', 'messenger']) adb(['install', '-r', path.join(STUB_DIR, f, 'debug', `share-stub-${f}-debug.apk`)])
}
export function uninstallShareStubs() {
  for (const p of ['com.zing.zalo', 'com.zhiliaoapp.musically', 'com.facebook.orca']) adb(['uninstall', p], { allowFail: true })
}
export const clearLog = () => adb(['logcat', '-c'], { allowFail: true })
/** The shares the stubs received since [clearLog], parsed. */
export function receivedShares() {
  const out = adb(['logcat', '-d', '-s', 'E2E_SHARE:I'], { allowFail: true }) || ''
  return out.split(/\r?\n/).map((l) => l.slice(l.indexOf('{'))).filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
