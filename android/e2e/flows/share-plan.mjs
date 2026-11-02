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
  const card = await a.planShareButton()
  check('mở lại → thẻ kế hoạch v2 hiện đủ («TAPPY PLAN» + nút «Chia sẻ»)', !!card)
  if (!card) return
  const PICS = '/sdcard/Pictures/TappyAI'
  // Scroll INSIDE the bottom sheet: up only — a downward drag at its top dismisses the sheet.
  const inSheet = async (q) => {
    for (let i = 0; i <= 8; i++) { const n = a.find(q); if (n && n.y1 > 200 && n.y2 < 2150) return n; a.sh('input', 'swipe', '540', '1700', '540', '900', '500'); await a.sleep(900) }
    return null
  }
  let savedBytes = null
  for (const [tile, pkg, wantImage] of [['Zalo', 'com.zing.zalo', false], ['TikTok (gửi ảnh)', 'com.zhiliaoapp.musically', true]]) {
    const btn = await a.planShareButton()
    await a.tap(btn, { after: 3000 })
    // SL1: the sheet mints the plan's page first ("Đang tạo liên kết kế hoạch…"), then draws the plan image.
    await a.waitGone(/Đang tạo liên kết kế hoạch/, { timeout: 30000 }).catch(() => {})
    await a.waitGone(/^Đang tạo ảnh/, { timeout: 30000 }).catch(() => {})
    shot(`sheet-${pkg}`)
    const sheet = a.texts().join(' | ')
    check(`sheet mẫu #6 cho kế hoạch: "Xem kế hoạch này trên TappyAI" + link /plan/ (${tile})`, /Chia sẻ với mọi người/.test(sheet) && /Xem kế hoạch này trên TappyAI/.test(sheet) && /uat\.tappyai\.com\/plan\//.test(sheet), sheet.slice(0, 160))
    if (wantImage) {
      // "Lưu về máy" = THE plan image (sample #7), 1080 wide; TikTok gets the same file.
      a.sh('rm', '-rf', PICS)
      const save = await inSheet('Lưu về máy')
      if (save) await a.tap(save, { after: 3000 })
      const name = (a.sh('ls', PICS) || '').split(/\s+/).find((f) => f.endsWith('.png')) || ''
      const size = (a.sh('stat', '-c', '%s', `${PICS}/${name}`) || '').trim()
      savedBytes = Number(size) || null
      const head = name ? a.sh('xxd', '-s', '16', '-l', '8', '-p', `${PICS}/${name}`).trim() : ''
      const width = head ? parseInt(head.slice(0, 8), 16) : 0
      const height = head ? parseInt(head.slice(8, 16), 16) : 0
      check('"Lưu về máy" = tappyai-plan-….png, ảnh kế hoạch rộng 1080', /^tappyai-plan-\d{4}-\d{2}-\d{2}\.png$/.test(name) && width === 1080 && height > 1800, `${name} ${width}×${height}`)
    }
    a.clearLog()
    const t = await inSheet(tile)
    if (!t) { check(`thấy ô «${tile}»`, false); await a.back(); continue }
    await a.tap(t, { after: 3000 })
    let got
    for (let i = 0; i < 20 && !got; i++) { got = a.receivedShares().find((x) => x.receiver === pkg); if (!got) await a.sleep(1500) }
    shot(`received-${pkg}`)
    check(`${tile} nhận ${wantImage ? 'ĐÚNG file ảnh kế hoạch đã lưu' : 'kế hoạch'}`, !!got && (wantImage ? /^image\//.test(got.streamMime || got.type || '') && got.streamBytes === savedBytes : !!(got.text || got.streamBytes)),
      got ? `${got.type} ${got.streamMime || ''} ${got.streamBytes || 0}B${wantImage ? ` vs ${savedBytes}` : ''}` : 'không nhận gì')
    check(`${tile} kèm link kế hoạch trên UAT`, !!got?.text && /https:\/\/uat\.tappyai\.com\//.test(got.text), (got?.text || '').replace(/\n/g, ' ').slice(0, 100))
    await a.dismissForeign(); await a.launch()
    // A conversation reopened from history is its own screen (no tab bar): close the sheet if still up.
    if (a.visible(/Chia sẻ với mọi người|Tùy chọn khác|Chia sẻ nhanh qua ứng dụng/)) await a.back()
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
