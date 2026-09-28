// (i) Plan share, deterministic: a conversation holding a real trip plan (the golden-set reply the
// web session recorded on UAT, T1 — no AI call) is seeded for the Pro account, reopened from
// "Lịch sử chat" (the user's own path back to a plan), and its "📤 Chia sẻ lịch trình" is sent to
// Zalo (link + text) and TikTok (the rendered card as an IMAGE FILE) — stand-in apps under the real
// package names (android/e2e/share-stub). Web twin: /chat/<id> shows the same plan and share menu.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { asUser } from '../lib/api.mjs'

export const webAccount = 'e2e.android.pro@example.com'
const TITLE = '[E2E] Kế hoạch Đà Nẵng'
const golden = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/src/test/resources/golden/T1.json'), 'utf8')).turns[0]
let seededId = null

async function seed() {
  if (seededId) return seededId
  const api = await asUser(webAccount)
  const list = await api('/api/conversations')
  for (const c of (list.json || []).filter((c) => c.title === TITLE)) await api(`/api/conversations?id=${c.id}`, { method: 'DELETE' })
  const r = await api('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title: TITLE, category: 'travel', messages: [{ role: 'user', content: golden.user }, { role: 'assistant', content: golden.text }] }),
  })
  seededId = r.json?.id
  if (!seededId) throw new Error('could not seed the plan conversation: ' + JSON.stringify(r.json).slice(0, 200))
  return seededId
}

export async function android({ a, shot, check, seeded }) {
  await seed()
  a.installShareStubs()
  await a.signIn(seeded.users.pro.email)
  await a.tap('Tôi', { after: 3000 })
  await a.tap(await a.scrollTo('Lịch sử chat'), { after: 4000 })
  const row = await a.scrollTo(TITLE, { max: 6 }).catch(() => null)
  check('Lịch sử chat có cuộc trò chuyện kế hoạch', !!row)
  if (!row) return
  await a.tap(row, { after: 5000 })
  shot('reopened')
  const card = await a.scrollTo(/Chia sẻ lịch trình/, { max: 10 }).catch(() => null)
  check('mở lại → thẻ kế hoạch hiện đủ (có "Chia sẻ lịch trình")', !!card)
  if (!card) return
  for (const [tile, pkg, wantImage] of [['Zalo', 'com.zing.zalo', false], ['TikTok (gửi ảnh)', 'com.zhiliaoapp.musically', true]]) {
    const btn = await a.scrollTo(/Chia sẻ lịch trình/, { max: 10 }).catch(() => null)
    await a.tap(btn, { after: 3000 })
    // A plan share first publishes the plan's own page ("Đang tạo kế hoạch chia sẻ…").
    await a.waitGone(/Đang tạo kế hoạch chia sẻ/, { timeout: 30000 }).catch(() => {})
    shot(`sheet-${pkg}`)
    const sheet = a.texts().join(' | ')
    check(`sheet chia sẻ kế hoạch có Zalo / Facebook / TikTok (${tile})`, /Zalo/.test(sheet) && /Facebook/.test(sheet) && /TikTok/.test(sheet), sheet.slice(0, 140))
    a.clearLog()
    const t = a.find(tile) || await a.scrollRowTo(tile, /Zalo|Facebook|Messenger|TikTok/).catch(() => null)
    if (!t) { check(`thấy ô «${tile}»`, false); await a.back(); continue }
    await a.tap(t, { after: 6000 })
    const got = a.receivedShares().find((s) => s.receiver === pkg)
    shot(`received-${pkg}`)
    check(`${tile} nhận ${wantImage ? 'ẢNH kế hoạch (file)' : 'kế hoạch'}`, !!got && (wantImage ? /^image\//.test(got.streamMime || got.type || '') && got.streamBytes > 5000 : !!(got.text || got.streamBytes)),
      got ? `${got.type} ${got.streamMime || ''} ${got.streamBytes || 0}B` : 'không nhận gì')
    check(`${tile} kèm link kế hoạch trên UAT`, !!got?.text && /https:\/\/uat\.tappyai\.com\//.test(got.text), (got?.text || '').replace(/\n/g, ' ').slice(0, 100))
    await a.dismissForeign(); await a.launch()
    // A conversation reopened from history is its own screen (no tab bar): stay on it.
    await a.tap('Chat', { after: 2500 }).catch(() => {})
  }
}

export async function web({ w, page, shot, check }) {
  const id = await seed()
  await w.go(`/chat/${id}`, 6000)
  await shot('reopened')
  const body = await page.locator('body').innerText()
  check('web mở lại → thấy kế hoạch', /Ngày 1|Chia sẻ lịch trình|Chia sẻ kế hoạch/.test(body))
  const share = page.getByText(/Chia sẻ lịch trình|Chia sẻ kế hoạch/).first()
  if (await share.count()) {
    await share.click().catch(() => {})
    await page.waitForTimeout(4000)
    await shot('share-menu')
    const t = await page.locator('body').innerText()
    check('web menu chia sẻ kế hoạch có Zalo / Facebook / TikTok', /Zalo/.test(t) && /Facebook/.test(t) && /TikTok/.test(t))
  } else check('web có nút chia sẻ kế hoạch', false)
}
