// (i) Share LAYOUTS approved by the owner 29/09 (docs/design/share-layouts/): the sheet is sample
// #6 ("Chia sẻ với mọi người" + "Ảnh chia sẻ" with a layout picker and the preview), the cards are
// sample #1 (review / clip / profile QR) — and the ONE FILE rule: "Lưu về máy" writes exactly the
// previewed card (tappyai-<layout>-YYYY-MM-DD.png, 1080×1920 for content cards, 1200 wide for the
// TappyAI QR card), and TikTok receives that same file (same byte count), except an uploaded clip,
// which goes as its own video. Stand-in TikTok under the real package (android/e2e/share-stub).
// Web twin: the same sheets on uat.tappyai.com, the downloaded files measured the same way.
import fs from 'node:fs'
import path from 'node:path'

export const webAccount = 'e2e.android.pro@example.com'
const PICS = '/sdcard/Pictures/TappyAI'

/** Scroll INSIDE the bottom sheet: up only — a downward drag at its top would dismiss the sheet. */
async function sheetScrollTo(a, q, max = 8) {
  for (let i = 0; i <= max; i++) {
    const n = a.find(q)
    if (n && n.y1 > 200 && n.y2 < 2150) return n
    a.sh('input', 'swipe', '540', '1700', '540', '900', '500'); await a.sleep(900)
  }
  throw new Error(`could not scroll to ${q} in the sheet`)
}

function pngSize(file) {
  const b = fs.readFileSync(file)
  if (b.readUInt32BE(0) !== 0x89504e47) return null
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }
}

async function saveAndPull(a, outDir, tag) {
  a.sh('rm', '-rf', PICS)
  const row = await sheetScrollTo(a, 'Lưu về máy')
  await a.tap(row, { after: 3000 })
  const name = (a.sh('ls', PICS) || '').split(/\s+/).find((f) => f.endsWith('.png')) || ''
  if (!name) return { name: '', size: null }
  const local = path.join(outDir, `${tag}-${name}`)
  a.adb(['pull', `${PICS}/${name}`, local])
  return { name, size: fs.existsSync(local) ? pngSize(local) : null }
}

async function toTikTok(a) {
  a.clearLog()
  const t = await sheetScrollTo(a, /^TikTok \(gửi (ảnh|video)\)$/)
  const label = t.text
  await a.tap(t, { after: 3000 })
  // An uploaded clip is fetched first (≈12 MB), then handed over: wait for the stand-in to log it.
  let got
  for (let i = 0; i < 45 && !got; i++) { got = a.receivedShares().find((s) => s.receiver === 'com.zhiliaoapp.musically'); if (!got) await a.sleep(2000) }
  await a.dismissForeign(); await a.launch()
  // Back in the app the sheet may still be open over the tabs: close it.
  if (!a.find('Khám phá')) await a.back()
  return { label, got }
}

async function waitPreview(a) {
  for (let i = 0; i < 25; i++) {
    if (a.visible(/^Đang tạo ảnh/)) { await a.sleep(1000); continue }
    break
  }
  await a.sleep(1500)
}

export async function android({ a, shot, check, seeded, outDir }) {
  const dir = outDir || fs.mkdtempSync('share-cards-')
  a.installShareStubs()
  await a.signIn(seeded.users.pro.email)

  // ── Explore post: [Thẻ review | Thẻ clip, Mã QR] ──
  await a.tap('Khám phá', { after: 5000 })
  await a.tap('Chia sẻ', { after: 4000 })
  await waitPreview(a)
  shot('post-sheet')
  const t = a.texts().join(' | ')
  check('sheet mẫu #6: "Chia sẻ với mọi người" + "Ảnh chia sẻ" + gợi ý một file', /Chia sẻ với mọi người/.test(t) && /Ảnh chia sẻ/.test(t) && /Đúng ảnh này được lưu về máy và gửi lên TikTok/.test(t))
  const first = /Thẻ clip/.test(t) ? 'clip' : 'review'
  check('bài Explore có 2 mẫu: thẻ bài (mặc định) + Mã QR', /Thẻ (clip|review)/.test(t) && /Mã QR/.test(t), first)
  const saved1 = await saveAndPull(a, dir, 'android')
  check(`"Lưu về máy" = tappyai-${first}-YYYY-MM-DD.png, 1080×1920`, new RegExp(`^tappyai-${first}-\\d{4}-\\d{2}-\\d{2}\\.png$`).test(saved1.name) && saved1.size?.w === 1080 && saved1.size?.h === 1920, `${saved1.name} ${saved1.size?.w}×${saved1.size?.h}`)
  const tk1 = await toTikTok(a)
  if (/video/.test(tk1.label)) {
    check('clip TẢI LÊN → TikTok nhận chính video', !!tk1.got && /^video\//.test(tk1.got.streamMime || tk1.got.type || ''), `${tk1.got?.streamMime} ${tk1.got?.streamBytes}B`)
  } else {
    check('TikTok nhận ĐÚNG file đã lưu (cùng số byte)', !!tk1.got && tk1.got.streamBytes === saved1.size?.bytes, `${tk1.got?.streamBytes} vs ${saved1.size?.bytes}`)
  }
  // Switch to "Mã QR": the preview AND the file change.
  await a.tap('Khám phá', { after: 3000 })
  await a.tap('Chia sẻ', { after: 4000 })
  await a.tap('Mã QR', { after: 1500 })
  await waitPreview(a)
  shot('post-sheet-qr')
  const saved2 = await saveAndPull(a, dir, 'android')
  check('đổi sang "Mã QR" → file tappyai-post-…png, thẻ QR rộng 1200', /^tappyai-post-\d{4}-\d{2}-\d{2}\.png$/.test(saved2.name) && saved2.size?.w === 1200, `${saved2.name} ${saved2.size?.w}×${saved2.size?.h}`)
  await a.back()

  // ── Profile QR → "Chia sẻ profile" → sheet (variant profile) ──
  await a.tap('Tôi', { after: 4000 })
  await a.tap('Hiển thị hồ sơ QR', { after: 3000 })
  await a.tap(await a.scrollTo('Chia sẻ profile', { max: 4 }), { after: 3000 })
  await waitPreview(a)
  shot('profile-sheet')
  const pt = a.texts().join(' | ')
  check('hồ sơ: một mẫu (QR hồ sơ), không có bộ chọn', !/Mã QR/.test(pt) && /Xem hồ sơ của mình trên TappyAI/.test(pt))
  const saved3 = await saveAndPull(a, dir, 'android')
  check('hồ sơ: file tappyai-profile-…png, rộng 1200', /^tappyai-profile-\d{4}-\d{2}-\d{2}\.png$/.test(saved3.name) && saved3.size?.w === 1200, `${saved3.name} ${saved3.size?.w}×${saved3.size?.h}`)
  const tk3 = await toTikTok(a)
  check('hồ sơ: TikTok nhận đúng file đã lưu', !!tk3.got && tk3.got.streamBytes === saved3.size?.bytes, `${tk3.got?.streamBytes} vs ${saved3.size?.bytes}`)
}

export async function web({ w, page, shot, check, outDir }) {
  const dir = outDir || fs.mkdtempSync('share-cards-web-')
  async function download(tag, dispatch = false) {
    const save = page.getByTestId('share-target-save')
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), dispatch ? save.dispatchEvent('click') : save.click()])
    const name = dl.suggestedFilename()
    const local = path.join(dir, `web-${tag}-${name}`)
    await dl.saveAs(local)
    return { name, size: pngSize(local) }
  }
  await w.go('/reviews', 6000)
  await page.getByRole('button', { name: /Chia sẻ|Share/ }).first().click()
  await page.locator('[data-share-card-preview]').first().waitFor({ timeout: 30000 }).catch(() => {})
  await shot('post-sheet')
  const t = await page.locator('body').innerText()
  check('web sheet: "Chia sẻ với mọi người" + "Ảnh chia sẻ"', /Chia sẻ với mọi người/.test(t) && /Ảnh chia sẻ/.test(t))
  const s1 = await download('post')
  check('web "Lưu về máy" = tappyai-(review|clip)-….png 1080×1920', /^tappyai-(review|clip)-\d{4}-\d{2}-\d{2}\.png$/.test(s1.name) && s1.size?.w === 1080 && s1.size?.h === 1920, `${s1.name} ${s1.size?.w}×${s1.size?.h}`)
  await page.getByTestId('share-layout-post').click()
  await page.waitForTimeout(3000)
  await shot('post-sheet-qr')
  const s2 = await download('qr')
  check('web đổi "Mã QR" → tappyai-post-….png rộng 1200', /^tappyai-post-/.test(s2.name) && s2.size?.w === 1200, `${s2.name} ${s2.size?.w}×${s2.size?.h}`)
  await w.go('/profile', 5000)
  await page.locator('button[aria-label="Mã QR trang cá nhân của tôi"]:visible').first().click()
  // WEB BUG (ANDROID-REQUESTS R16): the post grid paints OVER this modal and covers the button,
  // so a real tap lands on a tile. The event is dispatched to the button to reach the sheet anyway.
  await page.getByRole('button', { name: /Chia sẻ liên kết/ }).dispatchEvent('click')
  await page.locator('[data-share-card-preview]').first().waitFor({ timeout: 30000 }).catch(() => {})
  await shot('profile-sheet')
  const s3 = await download('profile', true) // R16: the grid covers this sheet's rows too
  check('web hồ sơ: tappyai-profile-….png rộng 1200', /^tappyai-profile-/.test(s3.name) && s3.size?.w === 1200, `${s3.name} ${s3.size?.w}×${s3.size?.h}`)
}
