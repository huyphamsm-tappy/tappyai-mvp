#!/usr/bin/env node
// Automated PRODUCTION smoke test — DEPLOY-CHECKLIST §5, signed-OUT parts only.
// Lead-run right after the web deploy. Claude never runs this against production.
//
//   node scripts/release/smoke-prod.mjs --sha <release sha> [--out <dir>] [--review <uuid>]
//        [--plan-url https://www.tappyai.com/plan/<id>] [--only food,hotel] [--base https://www.tappyai.com]
//
// What it does (all as a guest; no bypass header, no service role, no credentials):
//   1. GET /            → 200
//   2. GET /api/version → { v } starts with --sha
//   3. Guest chat, one fresh browser context per case (a guest has a small LIFETIME quota, so every
//      case gets its own anonymous identity): food, delivery, shopping, hotel, event, flight,
//      "tối nay có chỗ nào đi chơi ở sài gòn ko", trip (2 turns). Per answer: /api/chat 200, non-empty
//      reply, NO literal "**", and for food/delivery/shopping/hotel/event/flight at least one
//      buy/booking control (commerce test ids, a "Mua/Đặt/Tìm trên/Xem trên…" label, or a link to a
//      known merchant host).
//   4. --plan-url (made by hand in the signed-in part, RELEASE-PLAN §5b): opens signed-out → 200,
//      brochure renders, <meta name="robots" content="noindex…">.
//   5. OG tags on a review page (--review, else the first /reviews/<uuid> link found on /reviews):
//      og:title, og:image, og:url on https://www.tappyai.com.
// Screenshots + page text go to --out (default ./smoke-prod-<utc>). Exit 1 if any check fails.
//
// ⚠ Production side effects, by design of the product: each chat case creates one anonymous auth
// user + its anon_chat_usage/user_events rows on production (same as any visitor). Nothing else is written.
//
// playwright-core is NOT a repo dependency. Either `npm i --no-save playwright-core` in a scratch dir
// and pass PLAYWRIGHT_CORE_DIR=<that dir>, or run from a dir where it resolves. Browser binary:
// PW_EXE (default: the local ms-playwright chromium headless shell).
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

// ---------- args ----------
const argv = process.argv.slice(2)
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt }
const BASE = (opt('--base', 'https://www.tappyai.com')).replace(/\/$/, '')
const SHA = opt('--sha')
const OUT = resolve(opt('--out', `smoke-prod-${new Date().toISOString().replace(/[:.]/g, '-')}`))
const REVIEW = opt('--review')
const PLAN_URL = opt('--plan-url')
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null
if (!SHA) { console.error('usage: --sha <release sha> is required'); process.exit(2) }
if (!/^https:\/\//.test(BASE)) { console.error('--base must be https'); process.exit(2) }
mkdirSync(OUT, { recursive: true })

async function loadPlaywright() {
  try { return await import('playwright-core') } catch { /* fall through */ }
  const dir = process.env.PLAYWRIGHT_CORE_DIR
  if (!dir) throw new Error('playwright-core not found: set PLAYWRIGHT_CORE_DIR to a dir with node_modules/playwright-core')
  return createRequire(join(resolve(dir), 'package.json'))('playwright-core')
}
const { chromium } = await loadPlaywright()
const EXE = process.env.PW_EXE || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'

// ---------- results ----------
const results = []
const record = (id, ok, detail = '') => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`) }

// ---------- 1 + 2: home + version ----------
{
  const r = await fetch(BASE + '/', { redirect: 'follow' })
  record('home-200', r.status === 200, `status ${r.status}`)
  const v = await fetch(BASE + '/api/version', { cache: 'no-store' }).then(x => x.json()).catch(e => ({ error: String(e) }))
  const got = String(v.v ?? '')
  record('api-version-sha', got.length >= 7 && (got.startsWith(SHA) || SHA.startsWith(got)), `served ${got || JSON.stringify(v)} expected ${SHA}`)
}

// ---------- browser helpers (pattern: scratchpad pw/shoot.mjs + chatShot.mjs, minus the UAT bypass) ----------
const browser = await chromium.launch({ executablePath: EXE, headless: true })
async function newSession() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2600 }, locale: 'vi-VN' })
  const page = await ctx.newPage()
  const logs = []
  const host = new URL(BASE).host
  page.on('console', m => { if (m.type() === 'error') logs.push(`console.error: ${m.text().slice(0, 300)}`) })
  page.on('response', r => { try { if (r.status() >= 500 && new URL(r.url()).host === host) logs.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`) } catch { /* ignore */ } })
  return { ctx, page, logs }
}
async function dismissLanguage(page) {
  const vi = page.getByRole('button', { name: /Tiếng Việt/ })
  if (await vi.count()) { await vi.first().click(); await page.waitForTimeout(600) }
}
async function declareAge(page) {
  await page.goto(BASE + '/age-check', { waitUntil: 'networkidle', timeout: 60000 })
  await dismissLanguage(page)
  if (await page.locator('[data-testid="age-dob-day"]').count()) {
    await page.locator('[data-testid="age-dob-day"]').selectOption('10')
    await page.locator('[data-testid="age-dob-month"]').selectOption('5')
    await page.locator('[data-testid="age-dob-year"]').selectOption('1990')
  } else {
    const inputs = page.locator('main input, input')
    await inputs.nth(0).fill('10'); await inputs.nth(1).fill('05'); await inputs.nth(2).fill('1990')
  }
  await page.getByRole('button', { name: /Tiếp tục/ }).last().click()
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
}
const COMPOSER = 'textarea:visible, input[aria-label="Hỏi TappyAI"]:visible, input[placeholder^="Nhắn tin"]:visible'
async function ask(page, q) {
  const box = page.locator(COMPOSER).first()
  await box.click(); await box.fill(q)
  const done = page.waitForResponse(r => r.url().includes('/api/chat') && r.request().method() === 'POST', { timeout: 130000 }).catch(() => null)
  await box.press('Enter')
  const res = await done
  if (res) { try { await res.finished() } catch { /* stream */ } }
  let prev = '', same = 0
  for (let k = 0; k < 120 && same < 4; k++) {  // settle: transcript stops changing
    await page.waitForTimeout(1000)
    const now = await page.locator('body').innerText().catch(() => '')
    same = now === prev ? same + 1 : 0; prev = now
  }
  return { status: res ? res.status() : 0, text: prev }
}
const MERCHANT_HOSTS = /(shopee|lazada|tiki|tiktok|grab|shopeefood|befood|booking\.com|trip\.com|agoda|traveloka|klook|ticketbox|vexere|vietnamairlines|vietjet|bambooairways|isclix|accesstrade|cellphones|dienmayxanh|thegioididong)\./i
const BUY_LABEL = /^(Mua|Đặt|Tìm trên|Xem trên|Giao|Book|Buy|Order)\b/i
async function countBuyControls(page) {
  return page.evaluate(({ hosts, label }) => {
    const H = new RegExp(hosts, 'i'), L = new RegExp(label, 'i')
    const testIds = document.querySelectorAll('[data-testid="commerce-lead"], [data-testid="commerce-handoffs"] a, [data-testid="commerce-handoffs"] button').length
    let byLink = 0, byLabel = 0
    for (const a of document.querySelectorAll('main a[href], a[href]')) {
      try { const u = new URL(a.href); if (u.host !== location.host && H.test(u.host)) byLink++ } catch { /* ignore */ }
    }
    for (const el of document.querySelectorAll('a, button')) { if (L.test((el.textContent || '').trim())) byLabel++ }
    return { testIds, byLink, byLabel }
  }, { hosts: MERCHANT_HOSTS.source, label: BUY_LABEL.source })
}

// ---------- 3: guest chat verticals ----------
const CASES = [
  { id: 'food', turns: ['quán phở ngon quận 3'], buy: true },
  { id: 'delivery', turns: ['đặt phở giao tận nhà quận 1'], buy: true },
  { id: 'shopping', turns: ['mua tai nghe bluetooth dưới 1 triệu'], buy: true },
  { id: 'hotel', turns: ['khách sạn Đà Lạt dưới 1 triệu một đêm'], buy: true },
  { id: 'event', turns: ['mua vé concert tháng 10 ở Sài Gòn'], buy: true },
  { id: 'flight', turns: ['vé máy bay Sài Gòn đi Hà Nội'], buy: true },
  { id: 'tonight-sg', turns: ['tối nay có chỗ nào đi chơi ở sài gòn ko'], buy: false },
  { id: 'trip', turns: ['đi du lịch Đà Nẵng 3 ngày 2 đêm, 2 người, 20 triệu', 'từ Sài Gòn, đi máy bay, ngày 15/10'], buy: false },
]
for (const c of CASES) {
  if (ONLY && !ONLY.has(c.id)) continue
  const { ctx, page, logs } = await newSession()
  try {
    await declareAge(page)
    await page.goto(BASE + '/chat', { waitUntil: 'networkidle', timeout: 60000 })
    await dismissLanguage(page)
    let last = { status: 0, text: '' }
    for (const [i, q] of c.turns.entries()) {
      last = await ask(page, q)
      await page.screenshot({ path: join(OUT, `chat-${c.id}-t${i + 1}.png`), fullPage: true })
      writeFileSync(join(OUT, `chat-${c.id}-t${i + 1}.txt`), last.text)
      record(`chat-${c.id}-t${i + 1}-status`, last.status === 200, `/api/chat ${last.status}`)
    }
    const reply = last.text.split(c.turns[c.turns.length - 1]).pop() ?? ''
    record(`chat-${c.id}-nonempty`, reply.trim().length > 80, `${reply.trim().length} chars after the question`)
    record(`chat-${c.id}-no-literal-**`, !last.text.includes('**'), last.text.includes('**') ? 'found "**" in the transcript' : '')
    if (c.buy) {
      const n = await countBuyControls(page)
      record(`chat-${c.id}-buy-controls`, n.testIds + n.byLink + n.byLabel > 0, JSON.stringify(n))
    }
    if (logs.length) writeFileSync(join(OUT, `chat-${c.id}.errors.txt`), logs.join('\n'))
    record(`chat-${c.id}-no-5xx`, !logs.some(l => /^5\d\d /.test(l)), logs.filter(l => /^5\d\d /.test(l)).join('; '))
  } catch (e) {
    record(`chat-${c.id}`, false, String(e).slice(0, 300))
    await page.screenshot({ path: join(OUT, `chat-${c.id}-error.png`), fullPage: true }).catch(() => {})
  } finally { await ctx.close() }
}

// ---------- 4: plan share link, signed out ----------
if (PLAN_URL) {
  const { ctx, page } = await newSession()
  try {
    const r = await page.goto(PLAN_URL, { waitUntil: 'networkidle', timeout: 60000 })
    await page.screenshot({ path: join(OUT, 'plan-share-signed-out.png'), fullPage: true })
    const robots = await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null)
    const body = await page.locator('body').innerText()
    record('plan-share-200', r?.status() === 200, `status ${r?.status()}`)
    record('plan-share-renders', body.trim().length > 200 && !/404|không tìm thấy|not found/i.test(body.slice(0, 400)), `${body.trim().length} chars`)
    record('plan-share-noindex', /noindex/i.test(robots || ''), `robots=${robots}`)
  } catch (e) { record('plan-share', false, String(e).slice(0, 300)) } finally { await ctx.close() }
} else {
  record('plan-share (skipped)', true, 'no --plan-url: do RELEASE-PLAN §5b manual step, then re-run with --only none --plan-url …')
}

// ---------- 5: OG tags on a review ----------
{
  let id = REVIEW
  if (!id) {
    const { ctx, page } = await newSession()
    try {
      await page.goto(BASE + '/reviews', { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForTimeout(2000)
      const hrefs = await page.$$eval('a[href*="/reviews/"]', as => as.map(a => a.getAttribute('href')))
      id = hrefs.map(h => (h || '').match(/\/reviews\/([0-9a-f-]{36})/)?.[1]).find(Boolean)
    } finally { await ctx.close() }
  }
  if (!id) record('review-og', false, 'no review id found on /reviews — pass --review <uuid>')
  else {
    const html = await fetch(`${BASE}/reviews/${id}`).then(r => r.text())
    writeFileSync(join(OUT, 'review-og.html'), html)
    const meta = p => html.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]*)"`, 'i'))?.[1] ?? null
    const t = meta('og:title'), img = meta('og:image'), url = meta('og:url')
    writeFileSync(join(OUT, 'review-og.txt'), JSON.stringify({ id, t, img, url }, null, 2))
    record('review-og-title', !!t, t ?? 'missing')
    record('review-og-image', !!img && /^https:\/\//.test(img), img ?? 'missing')
    record('review-og-url-prod', !!url && url.startsWith(BASE + '/'), url ?? 'missing')
  }
}

await browser.close()
writeFileSync(join(OUT, 'smoke-result.json'), JSON.stringify({ base: BASE, sha: SHA, at: new Date().toISOString(), results }, null, 2))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed — evidence in ${OUT}`)
if (failed.length) { console.error('SMOKE FAILED:\n' + failed.map(f => ` - ${f.id}: ${f.detail}`).join('\n')); process.exit(1) }
