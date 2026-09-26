// Guest chat, full-page screenshot via CDP. usage: node shotchat.mjs <origin> <question> <out.png> [--wait ms]
// Guest flow only: no credentials of any kind. Declares 18+ through the public
// /api/age-declaration endpoint (the same call the age-check form makes), asks the
// question through the real UI, waits for the reply, captures the whole page.
import { spawn } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
const [origin, question, out] = process.argv.slice(2)
const opt = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1] }
const wait = Number(opt('--wait', '45000'))
const profile = 'C:/Users/Admin/AppData/Local/Temp/claude/D--Claude-Projects-TappyAI-tappyai-mvp--claude-worktrees-v3-phase4-design/72158bbd-2d9d-408d-98f5-c296276208fd/scratchpad/chrome-guest'
rmSync(profile, { recursive: true, force: true })
const port = 9334
const CHROME = process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe'
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--lang=vi', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page') } catch {} }
if (!target) { chrome.kill(); throw new Error('no chrome target') }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails || r.error) console.log('eval error', JSON.stringify(r.result?.exceptionDetails?.exception?.description ?? r.error).slice(0, 200)); return r.result?.result?.value }
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
// Image diagnostics: every image request's outcome (status or failure reason), printed at the end.
const imgReq = new Map(); const imgOut = []; let chatReqId = null; let chatReqHeaders = null
const onEvent = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Network.requestWillBeSent' && m.params.type === 'Image') imgReq.set(m.params.requestId, m.params.request.url)
  if (m.method === 'Network.requestWillBeSent' && m.params.request.url.endsWith('/api/chat') && m.params.request.method === 'POST') { chatReqId = m.params.requestId; chatReqHeaders = m.params.request.headers }
  if (m.method === 'Network.responseReceived' && imgReq.has(m.params.requestId)) imgOut.push(`${m.params.response.status} ${m.params.response.mimeType} ${imgReq.get(m.params.requestId).slice(0, 90)}`)
  if (m.method === 'Network.loadingFailed' && imgReq.has(m.params.requestId)) imgOut.push(`FAILED ${m.params.errorText} blocked=${m.params.blockedReason ?? '-'} ${imgReq.get(m.params.requestId).slice(0, 90)}`)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') imgOut.push('console.error ' + (m.params.args?.[0]?.value ?? '').toString().slice(0, 160)) }
ws.onmessage = onEvent
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: origin + '/robots.txt' }); await sleep(800)
await evalJs("localStorage.setItem('tappy_lang','vi'); 1")
// The guest's 18+ self-declaration — the public endpoint the age-check form posts to.
const decl = await evalJs("fetch('/api/age-declaration',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dateOfBirth:'1990-01-01'})}).then(r=>r.status)")
console.log('age-declaration →', decl)
await send('Page.navigate', { url: origin + '/chat' }); await sleep(6000)
// Type through React's own value setter so the controlled input sees the change, then click send.
const typed = await evalJs(`(() => {
  const ta = document.querySelector('textarea, input[placeholder*="Nhắn tin"]'); if (!ta) return 'no input'
  const proto = ta.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(ta, ${JSON.stringify(question)})
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  const btn = document.querySelector('#chat-form button[type="submit"]')
  if (!btn) return 'no send button'
  btn.click(); return 'sent'
})()`)
console.log('send →', typed)
await sleep(wait)
// The transcript lives in a 100dvh layout with its own scroll container, so instead of
// unclipping the DOM the viewport itself is made tall enough to hold the whole reply.
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 2600, deviceScaleFactor: 1, mobile: false }); await sleep(1500)
await evalJs(`(() => { for (const e of document.querySelectorAll('*')) if (e.scrollHeight > e.clientHeight + 40) e.scrollTop = 0; return 1 })()`)
const h = await evalJs('Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)')
const height = Math.min(Math.max(2600, Number(h) || 900), 8000)
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height, deviceScaleFactor: 1, mobile: false }); await sleep(800)
// Images: force eager loading, scroll each into view, wait until every one is complete (≤ 15 s).
await evalJs(`(async () => {
  const imgs = [...document.querySelectorAll('img')]
  for (const i of imgs) { i.loading = 'eager'; i.scrollIntoView({ block: 'center' }) }
  const t0 = Date.now()
  while (Date.now() - t0 < 15000 && imgs.some(i => !i.complete)) await new Promise(r => setTimeout(r, 300))
  window.scrollTo(0, 0); for (const e of document.querySelectorAll('*')) if (e.scrollHeight > e.clientHeight + 40) e.scrollTop = 0
  return imgs.filter(i => i.complete && i.naturalWidth > 0).length + '/' + imgs.length
})()`).then(v => console.log('images loaded', v))
await sleep(800)
// lh3.googleusercontent.com rate-limits bursts (429 → ORB → the card's onError hides the img).
// Retry the SAME urls up to 3 times with a pause, so the screenshot shows the photos the data carries.
for (let attempt = 1; attempt <= 3; attempt++) {
  const broken = await evalJs(`[...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length`)
  if (!broken) break
  console.log(`image retry ${attempt}: ${broken} broken`)
  await sleep(8000)
  await evalJs(`(async () => { const bad = [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0)
    for (const i of bad) { const s = i.src; i.style.display = ''; i.src = ''; i.src = s }
    const t0 = Date.now(); while (Date.now() - t0 < 15000 && bad.some(i => !i.complete)) await new Promise(r => setTimeout(r, 300)); return 1 })()`)
}
// Horizontal rails (the place carousel) were scrolled by the image pass — back to the start.
await evalJs(`(() => { for (const e of document.querySelectorAll('*')) if (e.scrollWidth > e.clientWidth + 20) { e.style.scrollBehavior = 'auto'; e.scrollTo({ left: 0, behavior: 'instant' }); e.scrollLeft = 0 } return 1 })()`)
await sleep(1200)
console.log('rail scrollLeft', await evalJs(`document.querySelector('[data-testid=place-carousel]')?.scrollLeft`))
const imgState = await evalJs(`JSON.stringify([...document.querySelectorAll('img')].map(i => ({ src: i.currentSrc.slice(0, 80), complete: i.complete, w: i.naturalWidth, display: getComputedStyle(i).display })))`)
console.log('img elements', imgState)
for (const l of imgOut) console.log('  net', l)
// What the UI actually received on the `8:` frame, and what it rendered for price.
if (chatReqId) {
  const hdr = Object.fromEntries(Object.entries(chatReqHeaders || {}).filter(([k]) => /^x-tappy/i.test(k)))
  console.log('chat request x-tappy headers', JSON.stringify(hdr))
  const b = await send('Network.getResponseBody', { requestId: chatReqId })
  const body = b.result?.body || ''
  const frames = body.split('\n').filter(f => f.startsWith('8:')).map(f => JSON.parse(f.slice(2)))
  const items = frames.flat().flatMap(d => d?.items || [])
  console.log('8: items', items.length, 'priceRangeText:', items.map(i => i.priceRangeText || '-').join(' | '))
  writeFileSync(out.replace(/\.png$/, '.stream.txt'), body)
}
console.log('price-range-text nodes in DOM', await evalJs(`document.querySelectorAll('[data-testid="price-range-text"]').length`))
// The assistant turn as text (prose + rendered cards), for a field-by-field comparison.
const text = await evalJs(`(() => { const nodes = [...document.querySelectorAll('main, [role=main], body')]; return (nodes[0] || document.body).innerText })()`)
writeFileSync(out.replace(/\.png$/, '.txt'), String(text ?? ''))
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log('saved', out, `1280x${height}`)
ws.close(); chrome.kill()
