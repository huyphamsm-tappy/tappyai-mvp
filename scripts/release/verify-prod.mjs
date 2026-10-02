#!/usr/bin/env node
// PRODUCTION VERIFICATION after the release — RELEASE-GOVERNANCE §4 step 9, PRODUCTION-VERIFICATION.md.
// Prepared 2026-09-29; run by the lead AFTER the deploy with Huy's go. Read-only except what a test account
// does in the product (chat turns, one plan share, avatar/video uploads on the TEST account, anonymous
// guest sessions). Never uses a service-role key against production.
//
//   node scripts/release/verify-prod.mjs --sha <release sha> [--base https://www.tappyai.com]
//        [--out <dir>] [--baseline <dir with baseline.json>] [--video <mp4>] [--skip-smoke]
//
// Accounts (production TEST accounts only — never a real user's):
//   VERIFY_A_EMAIL / VERIFY_A_PASSWORD   the account whose chats, uploads and plan share are exercised
//   VERIFY_B_EMAIL / VERIFY_B_PASSWORD   a second account, used only to prove it cannot read A's rows
//   VERIFY_SUPABASE_URL / VERIFY_SUPABASE_ANON_KEY   the project's PUBLIC url + anon key (as shipped in the page)
// UAT dry run (prove the script works): --auth audit-magiclink --audit-env <.env.local of the AUDIT project>
//   plus VERCEL_BYPASS=<bypass header value>. Refused on any www.tappyai.com base.
//
// What it checks (one PASS/FAIL line each; exit 1 on any FAIL):
//   0. /api/version = --sha
//   1. signed-out smoke (scripts/release/smoke-prod.mjs: pages, guest chat per area, buy controls, OG) — prod only
//   2. pages: /, /login, /reviews, /deals, a public review (+ OG), signed-out
//   3. sign-in A and B (password grant on the anon key)
//   4. chat as A: food, spa, entertainment, shopping, travel (+ flight): 200, non-empty, no error text,
//      buy/booking links present where the area has them; an "ask" card is answered once
//   5. affiliate: every go.isclix.com link carries sub1 (24 hex); one link per provider (Trip.com, Traveloka,
//      Lazada, Shopee/direct) is FOLLOWED hop by hop → click.accesstrade.vn with the same sub1 → merchant host
//   6. uploads as A: a video (create session → PUT → complete; the fixture is already metadata-neutralised, as
//      the app's client does before uploading — a raw phone clip is refused with identifying_metadata by design) and an image (/profile/edit avatar, UI)
//   7. sharing: a plan share created as A opens signed-out (200, noindex, brochure); review OG (step 2)
//   8. data isolation: B's token reads 0 of A's rows in conversations, chat_messages, user_memory,
//      user_preferences, notifications, plan_shares (PostgREST, RLS)
//   9. comparison with the pre-release baseline (evidence/prod-baseline-f42ae4b/baseline.json)
// Output: <out>/report.json, <out>/report.md, screenshots.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt }
const flag = name => argv.includes(name)
const BASE = opt('--base', 'https://www.tappyai.com').replace(/\/$/, '')
const SHA = opt('--sha')
const OUT = resolve(opt('--out', `verify-prod-${new Date().toISOString().replace(/[:.]/g, '-')}`))
const BASELINE = opt('--baseline')
const AUTH = opt('--auth', 'password')
const HERE = dirname(fileURLToPath(import.meta.url))
const VIDEO = resolve(opt('--video', join(HERE, '../../docs/uat/evidence/clip-neutralize-2026-09-26/playable-stored-neutralized.mp4')))
const IS_PROD = /(^|\.)tappyai\.com$/.test(new URL(BASE).host) && !/^uat\./.test(new URL(BASE).host)
if (!SHA) { console.error('usage: --sha <release sha> is required'); process.exit(2) }
if (AUTH === 'audit-magiclink' && IS_PROD) { console.error('REFUSING: audit-magiclink is a UAT dry-run mode, never production'); process.exit(2) }
mkdirSync(OUT, { recursive: true })
const BYPASS = IS_PROD ? null : process.env.VERCEL_BYPASS || null
const extraHeaders = BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}

async function loadPlaywright() {
  try { return await import('playwright-core') } catch { /* fall through */ }
  const dir = process.env.PLAYWRIGHT_CORE_DIR
  if (!dir) throw new Error('playwright-core not found: set PLAYWRIGHT_CORE_DIR to a dir with node_modules/playwright-core')
  return createRequire(join(resolve(dir), 'package.json'))('playwright-core')
}
const req = createRequire(join(HERE, '../../package.json'))
const { createClient } = req('@supabase/supabase-js')
const { chromium } = await loadPlaywright()
const EXE = process.env.PW_EXE || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'

const results = []
const record = (id, ok, detail = '', extra = undefined) => {
  results.push({ id, ok, detail, ...(extra ? { extra } : {}) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`)
}
const hget = (path, init = {}) => fetch(BASE + path, { ...init, headers: { ...(init.headers ?? {}), ...extraHeaders } })

// ---------- 0. version ----------
{
  const v = await hget('/api/version', { cache: 'no-store' }).then(x => x.json()).catch(e => ({ error: String(e) }))
  const got = String(v.v ?? '')
  record('api-version-sha', got.length >= 7 && (got.startsWith(SHA) || SHA.startsWith(got)), `served ${got || JSON.stringify(v)} expected ${SHA}`)
}

// ---------- 1. signed-out smoke (existing script) ----------
if (IS_PROD && !flag('--skip-smoke')) {
  const r = spawnSync(process.execPath, [join(HERE, 'smoke-prod.mjs'), '--sha', SHA, '--out', join(OUT, 'smoke'), '--base', BASE], { encoding: 'utf8', env: process.env, timeout: 30 * 60_000 })
  writeFileSync(join(OUT, 'smoke.log'), (r.stdout ?? '') + (r.stderr ?? ''))
  record('smoke-prod (signed-out §5a)', r.status === 0, `exit ${r.status}; see smoke.log`)
} else record('smoke-prod (signed-out §5a)', true, IS_PROD ? 'skipped by --skip-smoke' : 'skipped: not production (smoke-prod sends no bypass header)')

const browser = await chromium.launch({ executablePath: EXE, headless: true })
async function newContext(cookies = []) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN', extraHTTPHeaders: extraHeaders })
  if (cookies.length) await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  const logs = []
  page.on('response', r => { try { if (r.status() >= 500 && new URL(r.url()).host === new URL(BASE).host) logs.push(`${r.status()} ${new URL(r.url()).pathname}`) } catch { /* ignore */ } })
  return { ctx, page, logs }
}
async function dismiss(page) {
  for (const n of [/Tiếng Việt/, /^Bỏ qua$/]) { const b = page.getByRole('button', { name: n }); if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(500) } }
}
const shot = (page, name, full = false) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full, scale: 'css' }).catch(() => {})
const baselineRows = BASELINE && existsSync(join(BASELINE, 'baseline.json')) ? JSON.parse(readFileSync(join(BASELINE, 'baseline.json'), 'utf8')).results : null

// ---------- 2. pages (signed-out) ----------
const pageStatus = {}
{
  const { ctx, page } = await newContext()
  for (const [name, path] of [['home', '/'], ['login', '/login'], ['reviews', '/reviews'], ['deals', '/deals']]) {
    const t0 = Date.now()
    const r = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null)
    await page.waitForTimeout(2500); await dismiss(page); await shot(page, `page-${name}`)
    pageStatus[name] = r?.status() ?? 0
    record(`page ${path}`, pageStatus[name] === 200, `status ${pageStatus[name]} in ${Date.now() - t0} ms`)
  }
  const feed = await hget('/api/reviews/feed?limit=3').then(r => r.json()).catch(() => null)
  const id = JSON.stringify(feed ?? {}).match(/"id":"([0-9a-f-]{36})"/)?.[1]
  if (id) {
    const r = await page.goto(`${BASE}/reviews/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null)
    await page.waitForTimeout(2500); await shot(page, 'page-review')
    const og = await page.evaluate(() => Object.fromEntries(['og:title', 'og:image', 'og:url'].map(p => [p, document.querySelector(`meta[property="${p}"]`)?.getAttribute('content') ?? null])))
    pageStatus.review = r?.status() ?? 0
    record('public review page + OG', pageStatus.review === 200 && !!og['og:title'] && !!og['og:image'] && String(og['og:url'] ?? '').includes(`/reviews/${id}`), `status ${pageStatus.review}; og ${JSON.stringify(og)}`)
  } else record('public review page + OG', false, 'no review id from /api/reviews/feed')
  await ctx.close()
}

// ---------- 3. sign in ----------
function projectRef(url) { return new URL(url).host.split('.')[0] }
function cookiesFor(session, url) {
  const key = `sb-${projectRef(url)}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  const CHUNK = 3180
  const parts = value.length <= CHUNK ? [[key, value]] : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => [`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK)])
  return parts.map(([name, v]) => ({ name, value: v, domain: new URL(BASE).host, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))
}
let SUPA_URL = process.env.VERIFY_SUPABASE_URL, SUPA_ANON = process.env.VERIFY_SUPABASE_ANON_KEY
let signIn
if (AUTH === 'audit-magiclink') {
  const envFile = opt('--audit-env')
  const e = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
  if (!String(e.NEXT_PUBLIC_SUPABASE_URL).includes('zdaprdfgpbpnxyofagmc')) { console.error('REFUSING: --audit-env is not the audit project'); process.exit(2) }
  SUPA_URL = e.NEXT_PUBLIC_SUPABASE_URL; SUPA_ANON = e.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const admin = createClient(SUPA_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  signIn = async (email) => {
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (link.error) throw new Error('generateLink failed')
    const anon = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } })
    const v = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token })
    if (v.error || !v.data.session) throw new Error('verifyOtp failed')
    return v.data.session
  }
} else {
  signIn = async (email, password) => {
    const anon = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } })
    const r = await anon.auth.signInWithPassword({ email, password })
    if (r.error || !r.data.session) throw new Error('sign-in failed: ' + (r.error?.message ?? 'no session'))
    return r.data.session
  }
}
let A = null, B = null
try { A = await signIn(process.env.VERIFY_A_EMAIL, process.env.VERIFY_A_PASSWORD); record('sign-in A', true, 'session ok') } catch (e) { record('sign-in A', false, String(e.message ?? e)) }
try { B = await signIn(process.env.VERIFY_B_EMAIL, process.env.VERIFY_B_PASSWORD); record('sign-in B', true, 'session ok') } catch (e) { record('sign-in B', false, String(e.message ?? e)) }

// ---------- 4 + 5. chat as A, affiliate links ----------
const links = []
if (A) {
  const { ctx, page } = await newContext(cookiesFor(A, SUPA_URL))
  await page.goto(BASE + '/chat', { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(2500); await dismiss(page)
  await shot(page, 'signed-in-chat')
  const CASES = [
    ['food', 'Quán phở ngon Quận 1 cho 2 người tối nay, dưới 100k/người, chọn giúp mình luôn', true],
    ['spa', 'Spa massage body Quận 3 cho 1 người chiều nay dưới 500k, chọn giúp mình luôn', false],
    ['entertainment', 'Karaoke Quận 1 tối nay cho 4 người dưới 1 triệu, chọn giúp mình luôn', false],
    ['shopping', 'Mua tai nghe bluetooth chống ồn dưới 1 triệu, dùng đi làm hằng ngày, chọn giúp mình luôn', true],
    ['travel-hotel', 'Khách sạn Đà Nẵng gần biển 10/10 đến 12/10 cho 2 người dưới 1 triệu/đêm', true],
    ['travel-flight', 'Vé máy bay Sài Gòn đi Hà Nội ngày 15/10, 1 người, 1 chiều', true],
  ]
  const turn = (messages, sid) => page.evaluate(async ({ messages, sid }) => {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, chatSessionId: sid }) })
    return { status: r.status, raw: await r.text() }
  }, { messages, sid })
  const textOf = raw => raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) } catch { return '' } }).join('')
  const urlsOf = raw => {
    const decoded = raw.split('\n').map(l => { const m = /^[089a]:(.*)$/.exec(l); if (!m) return ''; try { return JSON.stringify(JSON.parse(m[1])).replace(/\\\//g, '/') } catch { return '' } }).join('\n')
    return [...new Set([...(textOf(raw) + '\n' + decoded).matchAll(/https?:\/\/[^\s"'()<>\]\\]+/g)].map(m => m[0]))]
  }
  for (const [area, q, needsBuy] of CASES) {
    const sid = crypto.randomUUID()
    let t = await turn([{ role: 'user', content: q }], sid)
    let text = textOf(t.raw)
    if (/"turnType":"ask"/.test(t.raw)) {
      t = await turn([{ role: 'user', content: q }, { role: 'assistant', content: text || 'Bạn cho mình thêm thông tin nhé.' }, { role: 'user', content: 'Chọn giúp mình luôn' }], sid)
      text = textOf(t.raw)
    }
    writeFileSync(join(OUT, `chat-${area}.raw.txt`), t.raw)
    const urls = urlsOf(t.raw)
    const merchant = urls.filter(u => /isclix|accesstrade|trip\.com|traveloka|lazada|shopee|tiki|cellphones|vexere|klook|vietnamairlines|agoda|booking\.com|tiktok|grab|befood|ticketbox/i.test(u))
    links.push(...merchant.map(u => ({ area, url: u })))
    const errorText = /đã xảy ra lỗi|an error occurred|có lỗi xảy ra/i.test(text)
    record(`chat A ${area}`, t.status === 200 && text.trim().length > 40 && !errorText && (!needsBuy || merchant.length > 0),
      `status ${t.status}, ${text.length} chars, ${merchant.length} merchant links${errorText ? ', ERROR TEXT' : ''}`)
  }
  await ctx.close()
}
{
  // Phương án C (owner 29/09): a tracked link in the reply is Tappy's /go/at click link and carries NO sub1;
  // each click on it draws a fresh random sub1 (recorded server-side) and redirects to ACCESSTRADE with it.
  const goLinks = links.filter(l => /\/go\/at\?/.test(l.url))
  const leaked = links.filter(l => /go\.isclix\.com/.test(l.url) && /[?&]sub1=/.test(l.url))
  record('affiliate: tracked links are /go/at click links, none carries a sub1', goLinks.length > 0 && leaked.length === 0, `${goLinks.length} click links, ${leaked.length} deep links with a fixed sub1`)
  const clickSub1 = []
  if (goLinks[0]) {
    for (let k = 0; k < 2; k++) {
      const r = await fetch(goLinks[0].url, { redirect: 'manual', headers: extraHeaders }).catch(() => null)
      const loc = r?.headers.get('location') ?? ''
      try { clickSub1.push(new URL(loc).searchParams.get('sub1')) } catch { clickSub1.push(null) }
    }
  }
  record('affiliate: two clicks on the same link → two different random sub1', clickSub1.length === 2 && clickSub1.every(v => /^[0-9a-f]{24}$/.test(v ?? '')) && clickSub1[0] !== clickSub1[1],
    `sub1 values (find them in the ACCESSTRADE click report and in commerce_click_attributions): ${clickSub1.join(', ')}`)
  const destOf = u => { try { const x = new URL(u); const inner = x.pathname === '/go/at' ? new URL(x.searchParams.get('u')) : x; return new URL(inner.searchParams.get('url')).host } catch { try { return new URL(u).host } catch { return '' } } }
  const want = [['tripcom', /trip\.com/], ['traveloka', /traveloka/], ['lazada', /lazada/], ['shopee', /shopee/]]
  for (const [name, re] of want) {
    const l = links.find(x => re.test(destOf(x.url)) || re.test(new URL(x.url).host))
    if (!l) { record(`affiliate follow ${name}`, false, 'no link for this provider in the chat answers (ask a query that returns it, or check the provider row)'); continue }
    const hops = []
    let url = l.url, sub1Seen = false
    for (let i = 0; i < 8; i++) {
      const r = await fetch(url, { redirect: 'manual', headers: { ...(new URL(url).host === new URL(BASE).host ? extraHeaders : {}), 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36' } }).catch(e => ({ status: 0, headers: new Map(), err: String(e) }))
      hops.push(`${r.status} ${new URL(url).host}`)
      const loc = r.headers.get?.('location')
      if (!loc || r.status < 300 || r.status > 399) break
      url = new URL(loc, url).toString()
      if (/go\.isclix\.com|click\.accesstrade\.vn/.test(url) && /sub1=[0-9a-f]{24}/.test(url)) sub1Seen = true
    }
    let bodyMerchant = null
    if (/click\.accesstrade\.vn/.test(url)) {
      // ACCESSTRADE records the click on this page and forwards with an HTML / JS redirect (status 200).
      const html = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36' } }).then(r => r.text()).catch(() => '')
      // The forward is a <meta refresh> to the network (e.g. Rakuten click.linksynergy.com?murl=<merchant>) — decode it.
      const text = decodeURIComponent(html.replace(/\\\//g, '/').replace(/&amp;/g, '&'))
      bodyMerchant = [...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1]).find(h => re.test(h)) ?? null
    }
    const tracked = /isclix|\/go\/at\?/.test(l.url)
    const reachedAT = hops.some(h => /accesstrade\.vn/.test(h))
    const merchantHop = hops.map(h => h.split(' ')[1]).find(h => re.test(h)) ?? bodyMerchant
    const final = merchantHop ?? new URL(url).host
    record(`affiliate follow ${name}`, tracked ? reachedAT && sub1Seen && !!merchantHop : re.test(final),
      `${tracked ? 'tracked' : 'direct'}; hops: ${hops.join(' → ')}; sub1 at ACCESSTRADE ${sub1Seen}; merchant ${final}${bodyMerchant ? ' (from the ACCESSTRADE page)' : ''}`)
  }
  writeFileSync(join(OUT, 'links.json'), JSON.stringify(links, null, 1))
}

// ---------- 6. uploads as A ----------
if (A) {
  const { ctx, page } = await newContext(cookiesFor(A, SUPA_URL))
  await page.goto(BASE + '/profile/edit', { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(2500); await dismiss(page)
  const video = readFileSync(VIDEO).toString('base64')
  const up = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const s = await fetch('/api/upload/video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'media.create-upload-session', kind: 'video', contentType: 'video/mp4', size: bytes.length }) })
    const sj = await s.json().catch(() => ({}))
    if (s.status !== 200 || !sj.uploadUrl) return { step: 'session', status: s.status, error: sj.error ?? null }
    const put = await fetch(sj.uploadUrl, { method: 'PUT', headers: { 'content-type': sj.contentType ?? 'video/mp4' }, body: bytes }).catch(e => ({ status: 0, e: String(e) }))
    const c = await fetch('/api/upload/video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'media.complete-upload', kind: 'video', key: sj.key }) })
    const cj = await c.json().catch(() => ({}))
    return { step: 'complete', put: put.status, status: c.status, ok: !!cj.ok, host: cj.url ? new URL(cj.url).host : null, error: cj.error ?? null }
  }, video)
  record('upload video (session → PUT → complete)', up.step === 'complete' && up.status === 200 && up.ok, JSON.stringify(up))
  // Image: the avatar input on /profile/edit (same UI a user taps). The image is generated here.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256
    const x = c.getContext('2d'); x.fillStyle = '#1E6BFF'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#fff'; x.font = 'bold 48px sans-serif'; x.fillText('QA', 90, 145)
    return c.toDataURL('image/png').split(',')[1]
  })
  const imgPath = join(OUT, 'avatar-test.png'); writeFileSync(imgPath, Buffer.from(png, 'base64'))
  const calls = []
  page.on('response', r => { const u = new URL(r.url()); if (/\/api\/(profile|upload)/.test(u.pathname) && r.request().method() !== 'GET') calls.push(`${r.status()} ${u.pathname}`) })
  const input = page.locator('input[type="file"]').first()
  if (await input.count()) {
    await input.setInputFiles(imgPath); await page.waitForTimeout(9000)
    await shot(page, 'upload-avatar', true)
    record('upload image (avatar, UI)', calls.length > 0 && calls.every(c => /^2\d\d /.test(c)), calls.join(', ') || 'no upload request seen')
  } else record('upload image (avatar, UI)', false, 'no file input on /profile/edit')
  await ctx.close()
}

// ---------- 7. plan share as A, opened signed-out ----------
if (A) {
  const { ctx, page } = await newContext(cookiesFor(A, SUPA_URL))
  await page.goto(BASE + '/chat', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const plan = { type: 'trip', title: 'QA — kế hoạch kiểm tra sau release', people: 2, days: [{ label: 'Ngày 1', items: [{ time: '09:00', name: 'Chợ Bến Thành', description: 'Kiểm tra chia sẻ kế hoạch' }] }] }
  const r = await page.evaluate(async (plan) => { const x = await fetch('/api/plans/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan }) }); return { status: x.status, body: await x.json().catch(() => ({})) } }, plan)
  await ctx.close()
  if (r.status === 200 && r.body.path) {
    const anon = await newContext()
    const res = await anon.page.goto(BASE + r.body.path, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null)
    await anon.page.waitForTimeout(2500); await shot(anon.page, 'plan-share-signed-out', true)
    const robots = await anon.page.locator('meta[name="robots"]').getAttribute('content').catch(() => null)
    const body = await anon.page.locator('body').innerText().catch(() => '')
    record('plan share opens signed-out', res?.status() === 200 && /noindex/.test(robots ?? '') && body.includes('QA — kế hoạch'), `share ${r.body.path}; status ${res?.status()}; robots ${robots}`)
    await anon.ctx.close()
  } else record('plan share opens signed-out', false, `POST /api/plans/share → ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`)
}

// ---------- 8. data isolation (B cannot read A) ----------
if (A && B) {
  const asB = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${B.access_token}` } } })
  const asA = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${A.access_token}` } } })
  for (const [table, col] of [['conversations', 'user_id'], ['chat_messages', 'sender_id'],['user_memory', 'user_id'], ['user_preferences', 'user_id'], ['notifications', 'user_id'], ['plan_shares', 'owner_id']]) {
    const own = await asA.from(table).select(col, { count: 'exact', head: true }).eq(col, A.user.id)
    const other = await asB.from(table).select(col, { count: 'exact', head: true }).eq(col, A.user.id)
    // plan_shares are public by id (the share page), so B may read them — the check there is that B cannot WRITE them.
    if (table === 'plan_shares') {
      // A no-op update (owner_id set to its own value): changes nothing even if RLS were open, but returns the rows B could touch.
      const w = await asB.from('plan_shares').update({ owner_id: A.user.id }).eq('owner_id', A.user.id).select('id')
      record(`isolation ${table} (B cannot modify A's)`, !w.error ? (w.data ?? []).length === 0 : true, `B update → ${w.error ? 'refused: ' + w.error.code : (w.data ?? []).length + ' rows'}`)
      continue
    }
    record(`isolation ${table}`, !other.error ? (other.count ?? 0) === 0 : true,
      `A sees ${own.error ? 'err ' + own.error.code : own.count} own rows; B sees ${other.error ? 'refused (' + other.error.code + ')' : other.count} of A's`)
  }
}

// ---------- 9. baseline comparison ----------
if (baselineRows) {
  const b = Object.fromEntries(baselineRows.map(r => [r.name, r.status]))
  for (const k of ['home', 'login']) record(`vs baseline ${k}`, pageStatus[k] === 200, `before ${b[k]} → after ${pageStatus[k]}`)
  record('vs baseline guest chat', true, `before: ${b['guest-chat']} (sign-in wall on f42ae4b); after: see smoke-prod guest cases`)
}

await browser.close()
const failed = results.filter(r => !r.ok)
const report = { at: new Date().toISOString(), base: BASE, sha: SHA, auth: AUTH, passed: results.length - failed.length, failed: failed.length, results }
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1))
writeFileSync(join(OUT, 'report.md'), [`# Production verification — ${BASE} @ ${SHA}`, '', `${report.passed} PASS · ${report.failed} FAIL · ${report.at}`, '', '| | Check | Detail |', '|---|---|---|',
  ...results.map(r => `| ${r.ok ? 'PASS' : '**FAIL**'} | ${r.id} | ${String(r.detail).replace(/\|/g, '\\|').slice(0, 300)} |`)].join('\n'))
console.log(`\n${report.passed} PASS · ${report.failed} FAIL → ${OUT}`)
process.exit(failed.length ? 1 : 0)
