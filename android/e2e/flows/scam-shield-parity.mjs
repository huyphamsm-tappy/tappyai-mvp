// 02/10 — Lá chắn lừa đảo, BA TRẠNG THÁI (quyết định A7/A8): không «An toàn», không điểm số, không «Độ tin cậy», không AI cho tin nhắn.
// Tin nhắn khớp trên máy (quen thuộc / đáng ngờ / chưa nhận ra); chỉ đường link đi kiểm tra; QR giải mã trên máy.
// Fixtures: node/gradle `TAPPY_QR_OUT=android/e2e/fixtures/qr gradlew :app:testUatUnitTest --tests '*QrCodesTest*'`.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const QR = (n) => path.join(here, '../fixtures/qr', n)

// Upward swipes only: a downward swipe from the top pulls the notification shade.
async function up(a, q, max = 8) {
  for (let i = 0; i < max; i++) {
    const n = a.find(q)
    if (n && n.y2 < a.screen()[1] * 0.854 && n.y1 > 200) return n
    a.swipe('up'); await a.sleep(900)
  }
  // Not below: it is above (e.g. after a long result). A SHORT downward drag from mid-screen, never from the top edge.
  for (let i = 0; i < 10; i++) {
    const n = a.find(q)
    if (n && n.y2 < a.screen()[1] * 0.854 && n.y1 > 200) return n
    a.swipe('down'); await a.sleep(800)
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
    const nodes = a.dump()
    cell = nodes.find((n) => n.clickable && /^Photo taken on/.test(n.desc || ''))
    // Samsung's picker has no «Photo taken on» labels: the newest picture is the first big cell of the grid.
    if (!cell && nodes.some((n) => /Gần đây|Recent/.test(n.text || n.desc || ''))) {
      cell = nodes.filter((n) => n.clickable && n.x2 - n.x1 > 150 && n.y2 - n.y1 > 150 && n.y1 > a.screen()[1] * 0.5).sort((x, y) => x.y1 - y.y1 || x.x1 - y.x1)[0]
    }
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
  for (let i = 0; i < 6 && !(scam && scam.y1 > 250 && scam.y2 < a.screen()[1] * 0.854); i++) { a.swipe('up'); await a.sleep(900); scam = a.find(/Kiểm tra ngay/) }
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
  const zone = a.dump().filter((n) => /Quét mã QR/.test(n.text || n.desc || '') && n.y2 > n.y1).sort((x, y) => x.y1 - y.y1)[1]
  if (!zone) throw new Error('QR drop zone not found')
  await a.tap(zone, { after: 2500 })
  await pickNewestPhoto(a)
  await a.sleep(7000)
  await seen(a, /Mã QR này là|Có dấu hiệu lừa đảo quen thuộc|Có một số dấu hiệu đáng ngờ|Chưa nhận ra dấu hiệu|Không đọc được/, 4)
  shot(name.replace('.png', ''))
}

async function runMessage(a, text) {
  await reopen(a)
  await up(a, 'Phân tích tin nhắn')
  await a.tap('Phân tích tin nhắn', { after: 1500 })
  const field = a.find(/Ví dụ: Một người/)
  await a.tap(field, { after: 800 })
  await a.pasteText(text)
  await a.hideKeyboard()
  await up(a, 'Phân tích ngay')
  await a.tap('Phân tích ngay', { after: 3000 })
}

// Words that must NEVER appear on a result (decision A7): a safe verdict, a score, a confidence figure, the AI quota.
const FORBIDDEN = /^An toàn$|^Safe$|Độ tin cậy|^Score$|^SCORE$|lượt hỏi AI|Gửi tin nhắn cho AI/

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.other.email)
  await openScam(a)
  shot('scamshield-open')
  await up(a, 'Phân tích tin nhắn')
  check('ô tin nhắn không còn chữ «lượt hỏi AI» / ảnh chụp màn hình (AI đã tắt)', !a.visible(/lượt hỏi AI/) && !a.visible('Tải ảnh chụp màn hình'))

  // 1) tin bình thường → chưa nhận ra dấu hiệu quen thuộc (KHÔNG phải an toàn)
  await runMessage(a, 'Chiều nay đi ăn phở nha, 6h gặp ở quán cũ.')
  check('tin bình thường → «Chưa nhận ra dấu hiệu quen thuộc»', await seen(a, /Chưa nhận ra dấu hiệu quen thuộc/))
  check('…kèm «KHÔNG có nghĩa là an toàn»', await seen(a, /KHÔNG có nghĩa là an toàn/, 2))
  check('…kèm «TappyAI không thay thế cơ quan chức năng» và 113', (await seen(a, /không thay thế cơ quan chức năng/, 3)) && a.visible(/113/))
  check('…không «An toàn», không điểm, không «Độ tin cậy», không hộp hỏi AI', !a.dump().some((n) => FORBIDDEN.test((n.text || n.desc || '').trim())))
  shot('normal-message')

  // 2) tin phạt nguội → quen thuộc (khớp tĩnh), có nguồn
  await runMessage(a, 'Thông báo phạt nguội: xe của bạn vi phạm giao thông, vui lòng nộp phạt trong 24 giờ để tránh bị xử lý.')
  check('tin phạt nguội → «Có dấu hiệu lừa đảo quen thuộc»', await seen(a, /Có dấu hiệu lừa đảo quen thuộc/))
  shot('scam-message-known-top')
  check('…kèm tên tình huống «Giống thủ đoạn»', await seen(a, /Giống thủ đoạn/, 2))
  check('…kèm khối nguồn chính thức (Bộ Công an)', await seen(a, /Nguồn: Bộ Công an|Thông tin từ nguồn chính thức/, 5))
  check('…kèm 113 và «không thay thế cơ quan chức năng» và nút chia sẻ', (await seen(a, /113/, 8)) && (await seen(a, /không thay thế cơ quan chức năng/, 3)) && (await seen(a, /Chia sẻ kết quả/, 3)))
  check('…không «An toàn», không điểm, không «Độ tin cậy»', !a.dump().some((n) => FORBIDDEN.test((n.text || n.desc || '').trim())))
  shot('scam-message-known')

  // 3) tin Trung thu → có một số dấu hiệu đáng ngờ
  await runMessage(a, 'Bưu phẩm Trung thu của bạn đã đến, quét mã QR đính kèm để nhận')
  check('tin Trung thu → «Có một số dấu hiệu đáng ngờ»', await seen(a, /Có một số dấu hiệu đáng ngờ/))
  shot('trung-thu-top')
  check('…kèm tình huống «Có phần giống thủ đoạn»', await seen(a, /Có phần giống thủ đoạn/, 2))
  shot('trung-thu-message')

  // 4) tin có link giả → chỉ link đi kiểm tra; không kết luận về tổ chức, nói «đặc điểm thường gặp ở link giả mạo»
  await runMessage(a, 'Vui lòng xác minh tài khoản tại https://vietcombank-xacthuc-taikhoan.top/login')
  check('tin có link giả → thẻ kết quả link «Có dấu hiệu lừa đảo quen thuộc» hoặc «đáng ngờ»', await seen(a, /Có dấu hiệu lừa đảo quen thuộc|Có một số dấu hiệu đáng ngờ/))
  check('…nói «đặc điểm thường gặp ở link giả mạo»', await seen(a, /đặc điểm thường gặp ở link giả mạo/, 2))
  check('…kèm lý do cụ thể', await seen(a, /Lý do cụ thể/, 3))
  check('…không điểm, không «Độ tin cậy», không «Nguy cơ cao»', !a.dump().some((n) => FORBIDDEN.test((n.text || n.desc || '').trim()) || /^Nguy cơ cao$|^Rất nguy hiểm$/.test((n.text || '').trim())))
  shot('link-in-message')

  // 5) QR link giả (mã dựng ra) → chỉ link giải mã đi kiểm tra
  await reopen(a)
  await scanQr(a, 'qr-link-danger.png', shot)
  check('QR link giả → «Có dấu hiệu lừa đảo quen thuộc» hoặc «đáng ngờ»', await seen(a, /Có dấu hiệu lừa đảo quen thuộc|Có một số dấu hiệu đáng ngờ/, 3))
  shot('qr-link-top')
  check('…không điểm, không «Độ tin cậy», không «An toàn»', !a.dump().some((n) => FORBIDDEN.test((n.text || n.desc || '').trim())))

  // 6) QR chữ / thanh toán / Wi-Fi → nêu loại, không hành động, không gửi ảnh
  await reopen(a)
  await scanQr(a, 'qr-text.png', shot)
  check('QR chữ → nêu loại «Mã QR này là»', await seen(a, /Mã QR này là/, 1))
  await reopen(a)
  await scanQr(a, 'qr-payment.png', shot)
  check('QR thanh toán → nêu loại thanh toán', a.visible(/thanh toán/i))
  await reopen(a)
  await scanQr(a, 'qr-wifi.png', shot)
  check('QR Wi-Fi → hiện tên mạng, KHÔNG hiện mật khẩu', (await seen(a, /Cafe Mo/, 3)) && !a.visible(/matkhau/))

  // 7) huỷ chọn ảnh → không sập
  await a.back(); await a.sleep(1200)
  await a.tap('Trang chủ', { after: 2500 })
  await openScam(a)
  await up(a, 'Quét mã QR')
  await a.tap('Quét mã QR', { after: 1200 })
  const zone = a.dump().filter((n) => /Quét mã QR/.test(n.text || n.desc || '') && n.y2 > n.y1).sort((x, y) => x.y1 - y.y1)[1]
  await a.tap(zone, { after: 2500 })
  await a.back(); await a.sleep(1500)
  shot('picker-cancelled')
  check('huỷ chọn ảnh → vẫn ở màn Lá chắn, không sập', a.visible(/Quét mã QR/) && /tappyai/.test(a.foreground()))
}
