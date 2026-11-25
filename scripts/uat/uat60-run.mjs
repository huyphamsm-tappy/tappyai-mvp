// UAT runner (17/11/2026): asks the questions of a UAT question file in the REAL web chat on the local UAT server, through a headless
// Chromium driven over the DevTools protocol (no test framework: the repo has none installed), and keeps a picture and the layout
// counts of every turn. Text cases only (single and multi-turn); attachments, clips, the Free account and deep research are run by hand.
//
//   node scripts/uat/uat60-run.mjs <questions.json> <out dir> <from id> <to id>
//
// Signs in as the UAT account with a one-time link made with the UAT project's own admin key (.env.local); refuses any project that is
// not the UAT one. Prints no key, token or address. One browser, one case after another: never two turns at once.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'

const [, , questionsPath, outDir, fromArg, toArg] = process.argv
if (!questionsPath || !outDir) { console.log('usage: node scripts/uat/uat60-run.mjs <questions.json> <out dir> <from> <to>'); process.exit(1) }
const REPO = path.resolve(import.meta.dirname, '../..')
const BASE = 'http://localhost:3000'
const UAT_REF = 'zdaprdfgpbpnxyofagmc'
const PROD_REF = 'fwznnobrdctuskgrvuik'
const DEBUG_PORT = 9333
const sleep = ms => new Promise(r => setTimeout(r, ms))

const all = JSON.parse(readFileSync(questionsPath, 'utf8')).questions
const cases = all.filter(q => q.id >= Number(fromArg ?? 1) && q.id <= Number(toArg ?? 999) && !q.account)
mkdirSync(path.join(outDir, 'screens'), { recursive: true })

// ── sign-in link (UAT project only) ──────────────────────────────────────────────────────────────────────────────────────────────
process.loadEnvFile(path.join(REPO, '.env.local'))
const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!supaUrl.includes(UAT_REF) || supaUrl.includes(PROD_REF) || !adminKey) { console.log('REFUSED: not the UAT project, or no admin key'); process.exit(1) }
const require = createRequire(path.join(REPO, 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const admin = createClient(supaUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
// UAT_AS: unset = the UAT account (Promax); "guest" = no sign-in at all (a visitor); "<address>@example.test" = a throwaway account
// made by scripts/uat/throwaway-accounts.mjs (only that domain is accepted: no real account can be named here).
const AS = (process.env.UAT_AS ?? '').trim()
const GUEST = AS === 'guest'
if (AS && !GUEST && !/^uat\.[a-z0-9.]+@example\.test$/i.test(AS)) { console.log('REFUSED: UAT_AS must be "guest" or a throwaway address at example.test'); process.exit(1) }
/** How long one turn may take before it is recorded as not answered (a visitor at the sign-in wall never gets an answer: no need to wait three minutes for it). */
const TURN_MS = Number(process.env.UAT_TURN_MS ?? (GUEST ? 75000 : 180000))
async function signInUrl() {
  const { data: list, error: e1 } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (e1) throw new Error('listUsers failed')
  const hit = list.users.filter(u => typeof u.email === 'string' && (AS ? u.email.toLowerCase() === AS.toLowerCase() : u.email.toLowerCase().startsWith('qa.admin.uat')))
  if (hit.length !== 1) throw new Error('UAT account not found exactly once')
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: hit[0].email })
  if (error || !data?.properties?.hashed_token) throw new Error('generateLink failed')
  return `${BASE}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent('/chat')}`
}

// ── a minimal DevTools-protocol client ───────────────────────────────────────────────────────────────────────────────────────────
function chromePath() {
  const root = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  // the headless shell: on this machine the full chrome.exe of the same build does not start (side-by-side configuration error)
  const dir = readdirSync(root).filter(d => /^chromium_headless_shell-\d+$/.test(d)).sort().pop()
  const exe = path.join(root, dir ?? '', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')
  if (!existsSync(exe)) throw new Error('no Chromium found')
  return exe
}
const profile = path.join(os.tmpdir(), `tappy-uat-chrome-${Date.now()}`)
const chrome = spawn(chromePath(), [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--window-size=1280,2000', '--hide-scrollbars', '--no-first-run', '--lang=vi-VN', 'about:blank'], { stdio: 'ignore' })
const quit = () => { try { chrome.kill() } catch { /* already gone */ } }
process.on('exit', quit)

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()
      const page = pages.find(p => p.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error('Chromium did not start')
}
const ws = new WebSocket(await connect())
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('devtools socket failed')) })
let seq = 0
const waiting = new Map()
ws.onmessage = ev => { const m = JSON.parse(ev.data); const w = waiting.get(m.id); if (w) { waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result) } }
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('page script failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 200))
  return r.result.value
}
const goto = async url => { await cdp('Page.navigate', { url }); await sleep(2500) }
const waitFor = async (expression, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evaluate(expression).catch(() => false)) return true; await sleep(700) } return false }

await cdp('Page.enable'); await cdp('Runtime.enable')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 2000, deviceScaleFactor: 1, mobile: false })
await goto(GUEST ? `${BASE}/chat` : await signInUrl())
await sleep(3000)
const who = await evaluate(`fetch('/api/subscription').then(r => r.json()).then(s => ({ plan: s.plan, anon: s.isAnonymous, remaining: s.remaining ?? null }))`)
console.log(GUEST ? 'visitor:' : 'signed in:', JSON.stringify(who))
if (who.anon !== GUEST) { console.log('REFUSED: the session is not the one asked for'); process.exit(1) }
// A visitor's chat trial starts with the 18+ self-declaration (the /age-check form). The same request the form sends, with a test adult
// date of birth (owner allowed this step for the UAT visitor, 17/11).
if (GUEST) console.log('age declaration:', await evaluate(`fetch('/api/age-declaration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateOfBirth: '1990-01-01' }) }).then(r => r.status)`))
// a fresh browser profile has no stored app language, and the first-visit language picker would cover every page: store Vietnamese (the picker's own key)
await evaluate(`localStorage.setItem('tappy_lang', 'vi')`)
// same for the first-use "3 quick questions" dialog (its own key): it would cover the answer in every picture
await evaluate(`localStorage.setItem('tappy_onboarded', '1')`)

const COMPOSER = `document.querySelector('textarea[placeholder^="Nhắn tin"], textarea')`
const SHARES = `document.querySelectorAll('[data-testid="message-share"]').length`
// What the page shows for the LAST answer: counts and a short excerpt (the full text stays in the picture).
const METRICS = `(() => {
  const shares = [...document.querySelectorAll('[data-testid="message-share"]')]
  let el = shares[shares.length - 1]
  if (!el) return { answered: false, tail: document.body.innerText.slice(-300) }
  // climb to the message: the first ancestor that has siblings and holds more than the action row and the Free plan's note under it
  const note = document.querySelector('[data-testid="pro-upsell-note"]')?.innerText ?? ''
  for (let i = 0; i < 12 && el.parentElement; i++) { el = el.parentElement; if (el.parentElement && el.parentElement.children.length > 1 && el.innerText.replace(note, '').trim().length > 80) break }
  const text = el.innerText
  const hosts = {}
  for (const a of el.querySelectorAll('a[href^="http"]')) { try { const h = new URL(a.href).hostname.replace(/^www\\./, ''); hosts[h] = (hosts[h] || 0) + 1 } catch {} }
  const src = el.querySelector('[data-doc-sources] summary')
  return {
    answered: true, chars: text.length, head: text.slice(0, 700), tail: text.slice(-200),
    links: Object.values(hosts).reduce((a, b) => a + b, 0), hosts,
    sourcesChip: src ? src.innerText.replace(/\\s+/g, ' ').trim() : null,
    tables: el.querySelectorAll('table').length, images: el.querySelectorAll('img').length,
    actionKinds: [...el.querySelectorAll('[data-action-kind]')].map(a => a.getAttribute('data-action-kind') + ':' + a.innerText.trim().slice(0, 20)).slice(0, 16),
    placeCards: el.querySelectorAll('[data-testid="place-book"], .v206-pc-primary, .v206-pc-btn').length,
    path: location.pathname,
    proNote: document.querySelectorAll('[data-testid="pro-upsell-note"]').length,
  }
})()`

// ── attachments and the Explore clip (cases with `attach`) ───────────────────────────────────────────────────────────────────────
// image: a food picture of the repo's own (public/home/inspire). pdf: a one-page document printed by this browser from known text, so the
// summary can be checked against it. clip: a published review of the UAT project that names a place and an address (read only), opened
// the way the Explore button opens the chat (/chat?ctx=<review id>&q=<question>).
const IMAGE_FILE = path.join(REPO, 'public/home/inspire/food-2.webp')
// absolute: DOM.setFileInputFiles hands the path to the browser process, which resolves a relative one against ITS OWN folder, finds no file and attaches nothing (18/11: case 52 never showed a tray)
const PDF_FILE = path.resolve(outDir, 'uat-attachment.pdf')
const PDF_TEXT = ['Biên bản họp dự án Sông Hồng, ngày 12/11/2026.', '1. Ngân sách quý 1 năm 2027 được duyệt là 3,2 tỷ đồng.', '2. Ngày ra mắt bản thử nghiệm dời từ 15/12/2026 sang 10/01/2027.', '3. Nhóm kỹ thuật tuyển thêm 4 kỹ sư, bắt đầu từ tháng 12.', '4. Đối tác vận chuyển được chọn là công ty Bình Minh, hợp đồng 12 tháng.', '5. Rủi ro lớn nhất là chậm tích hợp cổng thanh toán; người chịu trách nhiệm là chị Lan.']
if (cases.some(c => c.attach === 'pdf')) {
  await goto('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="font-family:Arial;font-size:16px;padding:40px">${PDF_TEXT.map(l => `<p>${l}</p>`).join('')}</body></html>`))
  const pdf = await cdp('Page.printToPDF', { printBackground: false })
  writeFileSync(PDF_FILE, Buffer.from(pdf.data, 'base64'))
}
let clipReview = null
if (cases.some(c => c.attach === 'clip')) {
  const { data } = await admin.from('reviews').select('id, place_name, place_address').eq('is_hidden', false).not('place_address', 'is', null).limit(40)
  clipReview = (data ?? []).find(r => typeof r.place_name === 'string' && r.place_name.trim().length > 3 && !/^chia s[eẻ]$/i.test(r.place_name.trim()) && typeof r.place_address === 'string' && r.place_address.trim().length > 8) ?? null
  console.log('clip review:', clipReview ? `${clipReview.place_name} | ${clipReview.place_address}` : 'none found')
}
const attachFile = async file => {
  const { root } = await cdp('DOM.getDocument', { depth: 0 })
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type="file"]' })
  if (!nodeId) throw new Error('no file input')
  await cdp('DOM.setFileInputFiles', { nodeId, files: [file] })
  await sleep(2500)
}
/** The question as a person types it: the "(đính kèm …)" note of the question file is for the reader of the file. */
const typed = q => q.replace(/^\([^)]*\)\s*/, '')

const results = []
for (const c of cases) {
  const turns = (c.turns ?? [c.q]).map(typed)
  const rec = { id: c.id, group: c.group, turns: [] }
  try {
    if (c.attach === 'clip') {
      if (!clipReview) throw new Error('no review with a place and an address in the UAT project')
      rec.clip = { place: clipReview.place_name, address: clipReview.place_address }
      // the Explore button's own way in: the chat sends the question itself
      await goto(`${BASE}/chat?ctx=${clipReview.id}&q=${encodeURIComponent(turns[0])}`)
      const started = Date.now()
      const done = await waitFor(`${SHARES} >= 1`, TURN_MS)
      await sleep(4000)
      const m = await evaluate(METRICS)
      const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 72 })
      const file = `q${String(c.id).padStart(2, '0')}.jpg`
      writeFileSync(path.join(outDir, 'screens', file), Buffer.from(shot.data, 'base64'))
      rec.turns.push({ q: turns[0], done, seconds: Math.round((Date.now() - started) / 1000), screen: `screens/${file}`, ...m })
      console.log(`case ${c.id} (clip): ${done ? 'done' : 'TIMEOUT'} chars=${m.chars ?? 0} links=${m.links ?? 0}`)
      results.push(rec)
      writeFileSync(path.join(outDir, `results-${fromArg ?? 1}-${toArg ?? 'end'}.json`), JSON.stringify(results, null, 2))
      continue
    }
    await goto(`${BASE}/chat`)
    if (!await waitFor(`!!${COMPOSER}`, 20000)) throw new Error('no composer')
    if (c.attach === 'image') await attachFile(IMAGE_FILE)
    if (c.attach === 'pdf') await attachFile(PDF_FILE)
    for (let t = 0; t < turns.length; t++) {
      const started = Date.now()
      if (c.mode === 'research' && t === 0) {
        // the composer's "+" menu, then "Nghiên cứu sâu" (the way a person picks the mode)
        // the menu opens only once the page is interactive: press "+" again until its item shows (17/11: one case pressed it too early)
        const opened = await waitFor(`(() => { if (document.querySelector('[data-testid="composer-deep"]')) return true; document.querySelector('button[aria-label="Thêm tệp hoặc chọn chế độ"]')?.click(); return false })()`, 20000)
        if (!opened) throw new Error('no deep research item in the + menu')
        await evaluate(`document.querySelector('[data-testid="composer-deep"]').click()`)
        await sleep(500)
      }
      await evaluate(`${COMPOSER}.focus()`)
      await cdp('Input.insertText', { text: turns[t] })
      await sleep(300)
      for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) })
      const done = await waitFor(`${SHARES} >= ${t + 1}`, c.mode === 'research' ? 540000 : TURN_MS)
      await sleep(4000) // cards and pictures arrive after the text
      const m = await evaluate(METRICS)
      const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 72 })
      const file = `q${String(c.id).padStart(2, '0')}${turns.length > 1 ? `-t${t + 1}` : ''}.jpg`
      writeFileSync(path.join(outDir, 'screens', file), Buffer.from(shot.data, 'base64'))
      rec.turns.push({ q: turns[t], done, seconds: Math.round((Date.now() - started) / 1000), screen: `screens/${file}`, ...m })
      if (c.mode === 'research' && done) {
        // the full report (the opened view): a second picture, and what the two known report faults look like in its text, counted
        // (a sentence glued to the next one after a figure, "35.Điều"; a raw source number written in words, "nguồn 144")
        const opened = await evaluate(`(() => { const b = document.querySelector('[data-testid="report-open"]'); if (b) b.click(); return !!b })()`)
        await sleep(3500)
        const report = await evaluate(`(() => {
          const text = document.body.innerText
          const glued = [...text.matchAll(/[\\d%)\\]]\\.[A-ZĐÀ-Ỹ][a-zà-ỹ]/g)].map(m => text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\\s+/g, ' '))
          // 18/11: a citation chip (a[data-cite]) is a number the page draws beside the word "nguồn" ("do nguồn [34] cung cấp"); only a number typed in the text itself is a leak
          const plain = (() => { const c = document.body.cloneNode(true); c.querySelectorAll('a[data-cite]').forEach(n => n.remove()); return c.innerText ?? c.textContent ?? '' })()
          const rawSource = [...plain.matchAll(/ngu[oồ]n\\s+\\d{2,3}\\b/gi)].map(m => plain.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\\s+/g, ' '))
          const label = (document.querySelector('[data-testid="report-summary-card"]')?.innerText ?? '').slice(0, 200)
          return { chars: text.length, glued: glued.slice(0, 6), gluedCount: glued.length, rawSource: rawSource.slice(0, 6), rawSourceCount: rawSource.length, links: document.querySelectorAll('a[href^="http"]').length, tables: document.querySelectorAll('table').length, card: label }
        })()`)
        const shot2 = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 72 })
        const file2 = `q${String(c.id).padStart(2, '0')}-report.jpg`
        writeFileSync(path.join(outDir, 'screens', file2), Buffer.from(shot2.data, 'base64'))
        rec.turns[rec.turns.length - 1].report = { opened, screen: `screens/${file2}`, ...report }
      }
      console.log(`case ${c.id}${turns.length > 1 ? ` turn ${t + 1}` : ''}: ${done ? 'done' : 'TIMEOUT'} ${Math.round((Date.now() - started) / 1000)}s chars=${m.chars ?? 0} links=${m.links ?? 0} tables=${m.tables ?? 0} images=${m.images ?? 0}`)
    }
  } catch (e) {
    rec.error = String(e?.message ?? e).slice(0, 200)
    console.log(`case ${c.id}: ERROR ${rec.error}`)
  }
  results.push(rec)
  writeFileSync(path.join(outDir, `results-${fromArg ?? 1}-${toArg ?? 'end'}.json`), JSON.stringify(results, null, 2))
}
ws.close(); quit()
console.log('finished', results.length, 'cases')
process.exit(0)
