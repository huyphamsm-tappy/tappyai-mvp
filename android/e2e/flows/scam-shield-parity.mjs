// 02/10 — Lá chắn lừa đảo đồng bộ 3 nền tảng (Android): tin nhắn khớp tình huống chính thức (trên máy, không gọi server),
// tin nhắn bình thường (KHÔNG bị gắn lừa đảo; hỏi đồng ý AI trước khi gửi), QR giải mã trên máy:
// link nguy hiểm → chỉ link đi kiểm tra; QR chữ / thanh toán / Wi-Fi → nêu loại + cảnh báo, không gửi đi đâu.
// Fixtures: node/gradle `TAPPY_QR_OUT=android/e2e/fixtures/qr gradlew :app:testUatUnitTest --tests '*QrCodesTest*'`.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const QR = (n) => path.join(here, '../fixtures/qr', n)

// Upward swipes only: a downward swipe from the top pulls the notification shade.
async function up(a, q, max = 8) {
  for (let i = 0; i < max; i++) {
    const n = a.find(q)
    if (n && n.y2 < 2050 && n.y1 > 200) return n
    a.swipe('up'); await a.sleep(900)
  }
  // Not below: it is above (e.g. after a long result). A SHORT downward drag from mid-screen, never from the top edge.
  for (let i = 0; i < 10; i++) {
    const n = a.find(q)
    if (n && n.y2 < 2050 && n.y1 > 200) return n
    a.sh('input', 'swipe', '540', '900', '540', '1500', '400'); await a.sleep(800)
  }
  throw new Error('could not scroll to ' + q)
}

// Scrolls up until [re] is on screen; false if it never appears.
async function seen(a, re, max = 7) {
  for (let i = 0; i < max; i++) {
    if (a.find(re)) return true
    a.swipe('up'); await a.sleep(800)
  }
  return !!a.find(re)
}

async function pickNewestPhoto(a) {
  let cell
  for (let i = 0; i < 12 && !cell; i++) {
    cell = a.dump().find((n) => n.clickable && /^Photo taken on/.test(n.desc || ''))
    if (!cell) await a.sleep(1000)
  }
  if (!cell) throw new Error('picker: no photo cell')
  await a.tap(cell, { after: 3500 })
}

async function pushQr(a, name) {
  // Only ONE QR picture may be in the gallery at a time: the picker offers the newest, and leftovers from earlier steps/runs
  // (a different code) would be picked instead.
  const old = a.sh('ls', '/sdcard/Pictures/').split(/\s+/).filter((f) => /^e2e-qr/.test(f))
  for (const f of old) { a.sh('rm', '-f', '/sdcard/Pictures/' + f); a.sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Pictures/' + f) }
  const dest = `/sdcard/Pictures/e2e-${name}`
  a.adb(['push', QR(name), dest])
  a.sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file://' + dest)
  await a.sleep(2500)
}

async function openScam(a) {
  await a.tap('Trang chủ', { after: 3000 })
  let scam = a.find(/Kiểm tra ngay/)
  for (let i = 0; i < 6 && !(scam && scam.y1 > 250 && scam.y2 < 2050); i++) { a.swipe('up'); await a.sleep(900); scam = a.find(/Kiểm tra ngay/) }
  if (!scam) throw new Error('ScamShield entry not found on Home')
  await a.tap(scam, { after: 4000 })
}

async function reopen(a) {
  await a.back(); await a.sleep(1200)
  if (!a.visible(/Kiểm tra ngay/)) { await a.tap('Trang chủ', { after: 2500 }) }
  await openScam(a)
}

async function scanQr(a, name, shot) {
  await pushQr(a, name)
  await up(a, 'Quét mã QR')
  await a.tap('Quét mã QR', { after: 1500 })
  const zone = a.dump().filter((n) => n.clickable && n.y1 > 500).sort((x, y) => (y.x2 - y.x1) * (y.y2 - y.y1) - (x.x2 - x.x1) * (x.y2 - x.y1))[0]
  if (!zone) throw new Error('QR drop zone not found')
  await a.tap(zone, { after: 2500 })
  await pickNewestPhoto(a)
  await a.sleep(7000)
  await seen(a, /Mã QR này là|Chi tiết phân tích|Khuyến nghị|Không đọc được/, 4)
  shot(name.replace('.png', ''))
}

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.other.email)
  await openScam(a)
  shot('scamshield-open')

  // ── tin nhắn lừa đảo mẫu → khớp tĩnh ──
  await up(a, 'Phân tích tin nhắn')
  await a.tap('Phân tích tin nhắn', { after: 1500 })
  const field = a.dump().find((n) => n.clickable && /Ví dụ: Một người tự xưng/.test(n.text || n.desc || '')) || a.find(/Ví dụ: Một người/)
  await a.tap(field, { after: 800 })
  await a.pasteText('Thông báo phạt nguội: xe của bạn vi phạm giao thông, vui lòng nộp phạt trong 24 giờ để tránh bị xử lý.')
  await a.hideKeyboard()
  await up(a, 'Phân tích ngay')
  await a.tap('Phân tích ngay', { after: 3000 })
  shot('message-scam-known')
  check('tin lừa đảo mẫu → «Giống thủ đoạn» (khớp trên máy)', a.visible(/Giống thủ đoạn/))
  check('có khối khẩn cấp 113', await seen(a, /113/))
  check('có dòng «TappyAI không phải cơ quan nhà nước»', await seen(a, /TappyAI không phải cơ quan nhà nước/))
  check('có nút chia sẻ kết quả', await seen(a, /Chia sẻ kết quả/))
  shot('message-scam-known-bottom')
  check('KHÔNG hỏi gửi AI (không đi server)', !a.visible(/Gửi tin nhắn cho AI/))

  // ── tin nhắn bình thường → không bị gắn lừa đảo; hỏi đồng ý AI ──
  await reopen(a)
  await up(a, 'Phân tích tin nhắn')
  await a.tap('Phân tích tin nhắn', { after: 1500 })
  const f2 = a.find(/Ví dụ: Một người/)
  await a.tap(f2, { after: 800 })
  await a.pasteText('Chiều nay đi ăn phở nha, 6h gặp ở quán cũ.')
  await a.hideKeyboard()
  await up(a, 'Phân tích ngay')
  await a.tap('Phân tích ngay', { after: 2500 })
  shot('message-normal-consent')
  check('tin bình thường không khớp thủ đoạn → hỏi đồng ý gửi AI', a.visible(/Gửi tin nhắn cho AI/))
  await a.tap('Không gửi', { after: 1500 })
  check('«Không gửi» → không gửi gì (không có «Đang phân tích»)', !a.visible(/Đang phân tích/))
  await up(a, 'Phân tích ngay')
  await a.tap('Phân tích ngay', { after: 1500 })
  await a.tap('Đồng ý gửi', { after: 15000 })
  shot('message-normal-result')
  check('đồng ý → server trả kết quả, không gắn «Giống thủ đoạn»', !a.visible(/Giống thủ đoạn/) && !a.visible(/Đang phân tích/))

  // ── QR ──
  await reopen(a)
  await scanQr(a, 'qr-link-danger.png', shot)
  check('QR link: chỉ link giải mã đi kiểm tra → ra kết quả kiểm tra link', a.visible(/Nguy cơ|Mức độ|Độ tin cậy|nguy hiểm|Nguy hiểm|đáng ngờ|Chưa xác định|Chi tiết phân tích|Khuyến nghị/i))

  await reopen(a)
  await scanQr(a, 'qr-text.png', shot)
  check('QR chữ → nêu loại «Mã QR này là»', await seen(a, /Mã QR này là/, 1))
  await reopen(a)
  await scanQr(a, 'qr-payment.png', shot)
  check('QR thanh toán → nêu loại thanh toán', a.visible(/Mã QR này là.*thanh toán|thanh toán/i))
  await reopen(a)
  await scanQr(a, 'qr-wifi.png', shot)
  check('QR Wi-Fi → hiện tên mạng, KHÔNG hiện mật khẩu', (await seen(a, /Cafe Mo/, 3)) && !a.visible(/matkhau/))

  // ── từ chối chọn ảnh (huỷ picker) → không sập ──
  await reopen(a)
  await up(a, 'Quét mã QR')
  await a.tap('Quét mã QR', { after: 1200 })
  const zone = a.dump().filter((n) => n.clickable && n.y1 > 500).sort((x, y) => (y.x2 - y.x1) * (y.y2 - y.y1) - (x.x2 - x.x1) * (x.y2 - x.y1))[0]
  await a.tap(zone, { after: 2500 })
  await a.back(); await a.sleep(1500)
  shot('picker-cancelled')
  check('huỷ chọn ảnh → vẫn ở màn Lá chắn, không sập', a.visible(/Quét mã QR/) && a.foreground().includes(a.PKG))
}
