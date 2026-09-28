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
export async function scrollTo(q, { max = 8, dir = 'up' } = {}) {
  for (let i = 0; i < max; i++) {
    const n = find(q)
    if (n && n.y2 < 2050 && n.y1 > 150) return n
    swipe(dir)
    await sleep(900)
  }
  throw new Error(`could not scroll to ${q}`)
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
  await sleep(2500)
}
export function install(apk) { adb(['install', '-r', apk]) }

/** Signs the app in as a seeded AUDIT account without any UI typing (uat hook). */
export async function signIn(email) {
  const s = await sessionFor(email)
  writePrivate('session.json', JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }))
  sh('am', 'start', '-n', HOOK, '--es', 'op', 'session')
  await sleep(5000)
  sh('am', 'force-stop', PKG)
  await launch()
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
  /** screenrecord caps at 180 s, so long flows record in parts. */
  startVideo() {
    this.stopVideo()
    const remote = `/sdcard/e2e-${this.part}.mp4`
    this.remote = remote
    this.proc = spawn(ADB, ['-s', SERIAL, 'shell', 'screenrecord', '--time-limit', '180', '--bit-rate', '4000000', remote], { stdio: 'ignore' })
    this.startedAt = Date.now()
  }
  async stopVideo() {
    if (!this.proc) return
    sh('pkill', '-INT', 'screenrecord')
    await sleep(2500)
    adb(['pull', this.remote, path.join(this.dir, `video-${this.part}.mp4`)], { allowFail: true })
    sh('rm', '-f', this.remote)
    this.proc = null
    this.part++
  }
  async keepRecording() { if (this.proc && Date.now() - this.startedAt > 170000) { await this.stopVideo(); this.startVideo() } }
}
