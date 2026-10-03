// 02/10 — Chặn người dùng + Báo cáo người dùng, hành động THẬT trên UAT (DB audit), tài khoản test của bộ e2e.
// Web contract (docs/uat/ANDROID-REQUESTS.md §4, origin/rc/web-uat @ 56a26ae): `POST /api/users/{id}/block` (hàng `user_blocks`),
// `POST /api/users/{id}/report` (hàng `user_reports`), cả hai chỉ khi `GET /api/config → p8.userBlocks / p8.reports`.
// Chỉ đụng hàng của hai tài khoản test (pro ↔ other) và xoá lại ngay sau khi kiểm.
import { UAT_BASE, bypassSecret } from '../lib/env.mjs'
import { rest } from '../lib/supabase.mjs'
import { asUser } from '../lib/api.mjs'

export const webAccount = 'e2e.android.pro@example.com'

async function config() {
  const r = await fetch(`${UAT_BASE}/api/config`, { headers: { 'x-vercel-protection-bypass': bypassSecret() } })
  return r.json().catch(() => ({}))
}

export async function android({ a, shot, check, seeded }) {
  const me = seeded.users.pro
  const them = seeded.users.other
  const cfg = await config()
  const p8 = cfg.p8 || {}
  check('UAT /api/config: p8.userBlocks và p8.reports BẬT', p8.userBlocks === true && p8.reports === true, JSON.stringify(p8))
  const blocks = () => rest.get(`user_blocks?select=blocker_id,blocked_id&blocker_id=eq.${me.id}&blocked_id=eq.${them.id}`)
  const reports = () => rest.get(`user_reports?select=target_type,target_id,reason&reporter_id=eq.${me.id}&target_id=eq.${them.id}`)
  // Start clean: nothing of this pair left from an earlier run.
  await asUser(me.email).then((api) => api(`/api/users/${them.id}/block`, { method: 'DELETE' })).catch(() => {})
  await rest.del(`user_blocks?blocker_id=eq.${me.id}&blocked_id=eq.${them.id}`).catch(() => {})
  await rest.del(`user_reports?reporter_id=eq.${me.id}&target_id=eq.${them.id}`).catch(() => {})
  // Deterministic start: the app's own local hide/block/report state from earlier runs would hide the very posts under test.
  a.sh('pm', 'clear', a.PKG)
  try {
    await a.signIn(me.email)
    await a.tap('Tôi', { after: 4000 })
    await a.scrollTo('E2E Người khác', { max: 12 })
    await a.tap('E2E Người khác', { after: 5000 })
    check('hồ sơ người khác mở được', a.visible('E2E Người khác'))

    // ── Báo cáo người dùng ──
    await a.tap('Thêm tùy chọn', { after: 1500 })
    shot('menu')
    check('menu hồ sơ có «Báo cáo người dùng» và «Chặn người dùng»', a.visible('Báo cáo người dùng') && a.visible('Chặn người dùng'))
    await a.tap('Báo cáo người dùng', { after: 1500 })
    shot('report-dialog')
    check('hộp «Báo cáo người dùng» có địa chỉ support@tappyai.com', a.visible('support@tappyai.com'))
    await a.tap('Spam', { after: 600 })
    await a.tap('Gửi báo cáo', { after: 6000 })
    shot('report-sent')
    const rep = await reports()
    check('server: đúng 1 hàng user_reports (target user, lý do spam)', rep.length === 1 && rep[0].target_type === 'user' && rep[0].reason === 'spam', JSON.stringify(rep))
    check('hộp đã đóng sau khi gửi được', !a.visible('Báo cáo người dùng'))

    // ── Chặn người dùng ──
    await a.tap('Thêm tùy chọn', { after: 1500 })
    await a.tap('Chặn người dùng', { after: 1500 })
    shot('block-confirm')
    check('hộp xác nhận «Chặn …?» có nút «Chặn»', a.visible(/^Chặn .*\?$/) && a.visible('Chặn'))
    check('chưa có hàng user_blocks trước khi bấm «Chặn»', (await blocks()).length === 0)
    await a.tap('Chặn', { after: 6000 })
    shot('blocked')
    const bl = await blocks()
    check('server: đúng 1 hàng user_blocks (pro chặn other)', bl.length === 1, JSON.stringify(bl))
  } finally {
    // Leave no trace on the test accounts.
    // Unblock through the SAME API the app used: it also clears the chat-side block that `GET /api/users/blocks` merges in (a REST delete of
    // `user_blocks` alone left the pair blocked and hid the other account's posts from every later flow).
    await asUser(me.email).then((api) => api(`/api/users/${them.id}/block`, { method: 'DELETE' })).catch(() => {})
    await rest.del(`user_blocks?blocker_id=eq.${me.id}&blocked_id=eq.${them.id}`).catch(() => {})
    await rest.del(`user_reports?reporter_id=eq.${me.id}&target_id=eq.${them.id}`).catch(() => {})
  }
}
