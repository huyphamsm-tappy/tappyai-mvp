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
  const [w, h] = a.screen()
  const x = String(Math.round(w / 2))
  const drag = (from, to) => a.sh('input', 'swipe', x, String(Math.round(h * from)), x, String(Math.round(h * to)), '350')
  for (let i = 0; i < max; i++) {
    if (a.find(re)) return true
    // A SHORT drag (a quarter of the screen): a long one can jump straight over a one-line heading on a small phone.
    drag(0.68, 0.42); await a.sleep(800)
  }
  if (a.find(re)) return true
  // Not below: it is above the starting point — come back up with short downward drags from mid-screen (never from the top edge).
  for (let i = 0; i < max * 2; i++) {
    drag(0.42, 0.68); await a.sleep(800)
    if (a.find(re)) return true
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
  await seen(a, /Mã QR này không chứa|Có dấu hiệu lừa đảo quen thuộc|Có một số dấu hiệu đáng ngờ|Chưa nhận ra dấu hiệu|Không đọc được/, 4)
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

  const part = process.env.SCAM_PART || 'all'
  if (part === '1' || part === 'all') {
  // 1) tin bình thường → chưa nhận ra dấu hiệu quen thuộc (KHÔNG phải an toàn)
  await runMessage(a, 'Chiều nay đi ăn phở nha, 6h gặp ở quán cũ.')
  check('tin bình thường → «Chưa nhận ra dấu hiệu quen thuộc»', await seen(a, /Chưa nhận ra dấu hiệu quen thuộc/))
  check('…kèm «KHÔNG có nghĩa là an toàn»', await seen(a, /KHÔNG có nghĩa là an toàn/, 2))
  check('…kèm «TappyAI không thay thế cơ quan chức năng» (không dòng báo tin: web chỉ in khi có tình huống khớp)', (await seen(a, /không thay thế cơ quan chức năng/, 3)) && !a.visible(/Báo ngay cho Công an nơi gần nhất/))
  check('…không «An toàn», không điểm, không «Độ tin cậy», không hộp hỏi AI', !a.dump().some((n) => FORBIDDEN.test((n.text || n.desc || '').trim())))
  shot('normal-message')

  // 2) tin phạt nguội → quen thuộc (khớp tĩnh), có nguồn
  await runMessage(a, 'Thông báo phạt nguội: xe của bạn vi phạm giao thông, vui lòng nộp phạt trong 24 giờ để tránh bị xử lý.')
  check('tin phạt nguội → «Có dấu hiệu lừa đảo quen thuộc»', await seen(a, /Có dấu hiệu lừa đảo quen thuộc/))
  shot('scam-message-known-top')
  check('…kèm «Tình huống tương ứng» + «Kịch bản số 22 trong danh sách của Bộ Công an»', (await seen(a, /Tình huống tương ứng/, 2)) && (await seen(a, /Kịch bản số 22 trong danh sách của Bộ Công an/, 2)))
  check('…kèm khối nguồn chính thức (Bộ Công an)', await seen(a, /Nguồn: Bộ Công an|Thông tin từ nguồn chính thức/, 5))
  check('…kèm dòng báo tin của web (đường dây 0692.345.860, Web final a43948d) ở cuối thẻ tình huống và «không thay thế cơ quan chức năng» (thẻ tin nhắn của web KHÔNG có nút chia sẻ)', (await seen(a, /Báo ngay cho Công an nơi gần nhất hoặc gọi 0692.345.860/, 8)) && (await seen(a, /không thay thế cơ quan chức năng/, 8)) && !a.visible(/Chia sẻ kết quả/))
  check('…không «An toàn», không điểm, không «Độ tin cậy»', !a.dump().some((n) => FORBIDDEN.test((n.text || n.desc || '').trim())))
  shot('scam-message-known')

  // 3) tin Trung thu → có một số dấu hiệu đáng ngờ
  await runMessage(a, 'Bưu phẩm Trung thu của bạn đã đến, quét mã QR đính kèm để nhận')
  check('tin Trung thu → «Có dấu hiệu lừa đảo quen thuộc» (web: khớp mạnh kịch bản 19)', await seen(a, /Có dấu hiệu lừa đảo quen thuộc/))
  shot('trung-thu-top')
  check('…kèm «Kịch bản số 19 trong danh sách của Bộ Công an»', await seen(a, /Kịch bản số 19 trong danh sách của Bộ Công an/, 2))
  shot('trung-thu-message')

  // 4) tin có link giả → chỉ link đi kiểm tra; không kết luận về tổ chức, nói «đặc điểm thường gặp ở link giả mạo»
  await runMessage(a, 'Vui lòng xác minh tài khoản tại https://vietcombank-xacthuc-taikhoan.top/login')
  // Web `ScamMessageResult.tsx`: the message verdict (server), then «Liên kết trong tin nhắn» with the link's short badge.
  check('tin có link giả → kết quả tin nhắn của server: «Có dấu hiệu lừa đảo quen thuộc» hoặc «đáng ngờ»', await seen(a, /Có dấu hiệu lừa đảo quen thuộc|Có một số dấu hiệu đáng ngờ/))
  check('…kèm khối «Liên kết trong tin nhắn» với nhãn ngắn của web («Đặc điểm link giả mạo» / «Có điểm đáng ngờ»)', (await seen(a, /Liên kết trong tin nhắn/, 6)) && (await seen(a, /Đặc điểm link giả mạo|Có điểm đáng ngờ|Chưa nhận ra dấu hiệu$/, 3)))
  check('…kèm «Không nên làm» / lời khuyên của server', await seen(a, /KHÔNG làm|Nên làm ngay/, 6))
  check('…không điểm, không «Độ tin cậy», không «Nguy cơ cao»', !a.dump().some((n) => FORBIDDEN.test((n.text || n.desc || '').trim()) || /^Nguy cơ cao$|^Rất nguy hiểm$/.test((n.text || '').trim())))
  shot('link-in-message')
  }
  if (part === '1') return
  if (part === '3') { await cancelPicker(a, shot, check); return }

  // 5) QR link giả (mã dựng ra) → chỉ link giải mã đi kiểm tra
  await reopen(a)
  await scanQr(a, 'qr-link-danger.png', shot)
  check('QR link giả → thẻ link «Đường link có đặc điểm thường gặp ở link giả mạo»', await seen(a, /Đường link có đặc điểm thường gặp ở link giả mạo|Đường link có một số điểm đáng ngờ/, 3))
  shot('qr-link-top')
  check('thẻ link có nút «Cảnh báo cho mọi người» + dòng gợi ý của web (KHÔNG bấm: sẽ tạo trang công khai trên UAT)', (await seen(a, /Cảnh báo cho mọi người/, 8)) && a.visible(/Tạo trang công khai/))
  check('…không điểm, không «Độ tin cậy», không «An toàn»', !a.dump().some((n) => FORBIDDEN.test((n.text || n.desc || '').trim())))

  // 6) QR chữ / thanh toán / Wi-Fi → nêu loại, không hành động, không gửi ảnh
  await reopen(a)
  await scanQr(a, 'qr-text.png', shot)
  check('QR chữ → «Mã QR này không chứa đường link web» + «Loại mã: văn bản»', (await seen(a, /Mã QR này không chứa đường link web/, 1)) && a.visible(/Loại mã: văn bản/))
  await reopen(a)
  await scanQr(a, 'qr-payment.png', shot)
  check('QR thanh toán → «Loại mã: thanh toán»', a.visible(/Loại mã: thanh toán/))
  await reopen(a)
  await scanQr(a, 'qr-wifi.png', shot)
  check('QR Wi-Fi → hiện «Nội dung đọc được» đúng như web (văn bản đã giải mã, gồm cả mật khẩu của chính mã đó)', (await seen(a, /Cafe Mo/, 3)) && a.visible(/matkhau/))

  if (part === '2') return
  await cancelPicker(a, shot, check)
}

async function cancelPicker(a, shot, check) {
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
