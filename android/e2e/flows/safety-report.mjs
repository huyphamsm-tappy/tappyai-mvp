// Báo cáo bài đăng/clip (Google Play: nội dung do người dùng tạo) trên UAT thật, DB AUDIT.
// Pro (người xem) mở hồ sơ «E2E Người khác» → mở một bài → «Thêm» → «Báo cáo» → chọn lý do → «Gửi báo cáo».
//   1. KHÔNG có mạng: hộp báo lỗi «Chưa gửi được báo cáo», KHÔNG báo «đã gửi», bài vẫn ở đó, server chưa có hàng nào.
//   2. Có mạng lại: gửi được → server có đúng 1 hàng `content_reports`; bài vừa báo biến khỏi lưới của người báo.
// Chặn người dùng / báo cáo người dùng là route Phase 8: UAT chưa có khối `p8` trong /api/config nên các nút đó PHẢI ẨN.
// Chỉ tạo hàng báo cáo cho bài [E2E] của tài khoản test và xoá lại ngay sau khi kiểm.
import { UAT_BASE, bypassSecret } from '../lib/env.mjs'
import { rest } from '../lib/supabase.mjs'

export const webAccount = 'e2e.android.pro@example.com'

async function config() {
  const r = await fetch(`${UAT_BASE}/api/config`, { headers: { 'x-vercel-protection-bypass': bypassSecret() } })
  return r.json().catch(() => ({}))
}

async function reportRows(ids) {
  return rest.get(`content_reports?select=content_id,reason&content_id=in.(${ids.join(',')})`)
}

export async function android({ a, shot, check, seeded }) {
  const ids = seeded.other.public
  const cfg = await config()
  const hasP8 = !!cfg.p8 && (cfg.p8.userBlocks || cfg.p8.reports)
  check(`UAT /api/config: khối p8 ${hasP8 ? 'CÓ' : 'chưa có'} (quyết định nút Chặn / Báo cáo người dùng)`, true, JSON.stringify(cfg.p8 ?? null))
  try {
    await a.signIn(seeded.users.pro.email)
    await a.tap('Tôi', { after: 4000 })
    await a.scrollTo('E2E Người khác', { max: 12 })
    await a.tap('E2E Người khác', { after: 5000 })
    shot('profile')
    check('hồ sơ người khác mở được', a.visible('E2E Người khác'))
    check(`hồ sơ: menu «Thêm tùy chọn» (báo cáo/chặn người dùng) ${hasP8 ? 'hiện' : 'ẨN vì server chưa hỗ trợ'}`, a.visible('Thêm tùy chọn') === hasP8)
    const tilesBefore = a.tiles().length
    check('hồ sơ có 3 bài công khai', tilesBefore === 3, `${tilesBefore} ô`)

    await a.tap(a.tiles()[0], { after: 6000 })
    // The detail screen's clip card is a 9:16 box taller than the viewport: the rail's «…» sits at its bottom edge.
    for (let i = 0; i < 4 && !a.find('Thêm'); i++) { a.swipe('up'); await a.sleep(900) }
    await a.tap('Thêm', { after: 1500 })
    shot('menu')
    check('menu «…» của bài người khác có «Báo cáo»', a.visible('Báo cáo'))
    check(`menu: «Chặn người dùng» ${hasP8 ? 'hiện' : 'ẨN vì server chưa hỗ trợ'}`, a.visible('Chặn người dùng') === hasP8)
    check('menu: KHÔNG có Xoá/Ẩn (không phải bài của mình)', !a.visible('Xóa bài') && !a.visible('Ẩn bài'))

    await a.tap('Báo cáo', { after: 1500 })
    shot('dialog')
    check('hộp «Báo cáo bài đăng»', a.visible('Báo cáo bài đăng'))
    const reasons = ['Spam', 'Quấy rối hoặc bắt nạt', 'Nội dung nhạy cảm', 'Lừa đảo', 'Vi phạm bản quyền', 'Khác']
    check('đủ 6 lý do', reasons.every((r) => a.visible(r)), reasons.filter((r) => !a.visible(r)).join(', '))
    check('có địa chỉ liên hệ support@tappyai.com', a.visible('support@tappyai.com'))
    await a.tap('Spam', { after: 600 })

    // 1) Không mạng.
    a.sh('svc', 'wifi', 'disable'); a.sh('svc', 'data', 'disable')
    await a.sleep(3500)
    await a.tap('Gửi báo cáo', { after: 5000 })
    shot('offline')
    check('mất mạng: hộp báo «Chưa gửi được báo cáo»', !!a.find(/Chưa gửi được báo cáo/))
    check('mất mạng: KHÔNG hiện «Đã gửi báo cáo»', !a.visible(/Đã gửi báo cáo/))
    check('mất mạng: hộp vẫn mở để thử lại', a.visible('Báo cáo bài đăng'))
    check('mất mạng: server chưa nhận hàng báo cáo nào', (await reportRows(ids)).length === 0)

    // 2) Có mạng lại.
    a.sh('svc', 'wifi', 'enable'); a.sh('svc', 'data', 'enable')
    await a.sleep(7000)
    await a.tap('Gửi báo cáo', { after: 5000 })
    shot('sent')
    const rows = await reportRows(ids)
    check('server: đúng 1 hàng content_reports cho bài vừa báo (lý do spam)', rows.length === 1 && rows[0].reason === 'spam', JSON.stringify(rows))
    check('hộp đã đóng sau khi gửi được', !a.visible('Báo cáo bài đăng'))

    // Bài vừa báo biến khỏi lưới của người báo.
    await a.back()
    await a.sleep(4000)
    shot('profile-after')
    if (!a.visible('E2E Người khác')) { await a.tap('Tôi', { after: 3000 }); await a.scrollTo('E2E Người khác', { max: 12 }); await a.tap('E2E Người khác', { after: 5000 }) }
    const tilesAfter = a.tiles().length
    check('bài vừa báo không còn trong lưới của người báo (3 → 2)', tilesAfter === tilesBefore - 1, `${tilesBefore} → ${tilesAfter}`)
  } finally {
    a.sh('svc', 'wifi', 'enable'); a.sh('svc', 'data', 'enable')
    await rest.del(`content_reports?content_id=in.(${ids.join(',')})`).catch(() => {})
  }
}

export async function web({ check }) {
  // The web twin of this flow is not part of the Android deliverable (web has its own report UI).
  check('web: ngoài phạm vi (luồng báo cáo của web do phiên web kiểm)', true)
}
