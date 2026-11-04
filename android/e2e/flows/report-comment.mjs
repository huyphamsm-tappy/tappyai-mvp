// 03/10 — Báo cáo BÌNH LUẬN, hành động thật trên UAT (DB audit), tài khoản test của bộ e2e.
// Web contract (docs/uat/ANDROID-REQUESTS.md §4, origin/rc/web-uat @ 56a26ae): `POST /api/comments/{id}/report` {reason, note?} → hàng
// `user_reports` (target_type 'comment'), chỉ khi `GET /api/config → p8.reports`. KHÔNG có `POST /api/reports`.
// `other` viết một bình luận trên bài [E2E] của chính nó; `pro` báo cáo bình luận đó; xoá hàng báo cáo và bình luận ngay sau khi kiểm.
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
  check('UAT /api/config: p8.reports BẬT', cfg.p8?.reports === true, JSON.stringify(cfg.p8 ?? null))
  const text = `[E2E] bình luận kiểm báo cáo ${Date.now().toString(36)}`
  const asOther = await asUser(them.email)
  // The grid's first tile is not necessarily `public[0]`: put the same marker comment on all three public posts, so whichever opens has it.
  const created = []
  for (const pid of seeded.other.public) {
    const posted = await asOther(`/api/reviews/${pid}/comments`, { method: 'POST', body: JSON.stringify({ body: text }) })
    if (posted.status < 300 && posted.json?.comment?.id) created.push({ postId: pid, id: posted.json.comment.id })
  }
  const commentId = created[0]?.id
  const commentIds = created.map((c) => c.id)
  check('đã tạo bình luận mẫu của `other` trên 3 bài [E2E] (UAT)', created.length === 3, commentIds.join(','))
  if (!commentId) return
  const rows = () => rest.get(`user_reports?select=target_type,target_id,reason&reporter_id=eq.${me.id}&target_id=in.(${commentIds.join(',')})`)
  // Deterministic start: the app's own local hide/block/report state from earlier runs would hide the very posts under test.
  a.sh('pm', 'clear', a.PKG)
  try {
    await a.signIn(me.email)
    await a.tap('Tôi', { after: 4000 })
    await a.scrollTo('E2E Người khác', { max: 12 })
    await a.tap('E2E Người khác', { after: 5000 })
    // A cold start (data cleared) loads the grid later than a warm one: wait for it instead of guessing a delay.
    for (let i = 0; i < 15 && a.tiles().length === 0; i++) await a.sleep(2000)
    await a.tap(a.tiles()[0], { after: 6000 })
    let found = false
    for (let i = 0; i < 6 && !found; i++) { found = a.visible(text); if (!found) { a.swipe('up'); await a.sleep(900) } }
    check('bình luận mẫu hiện trong màn Chi tiết', found)
    shot('comment')
    // The "Báo cáo" TEXT under the comment (not the post's «Thêm» menu): the lowest «Báo cáo» node on screen.
    const nodes = a.dump().filter((n) => (n.text || '') === 'Báo cáo').sort((x, y) => y.y1 - x.y1)
    check('dưới bình luận có nút «Báo cáo» (chỉ khi server bật p8.reports, không phải bình luận của mình)', nodes.length > 0)
    await a.tap(nodes[0], { after: 1500 })
    shot('dialog')
    check('hộp «Báo cáo bình luận»', a.visible('Báo cáo bình luận'))
    await a.tap('Spam', { after: 600 })
    await a.tap('Gửi báo cáo', { after: 6000 })
    shot('sent')
    const r = await rows()
    check('server: đúng 1 hàng user_reports (target comment, lý do spam)', r.length === 1 && r[0].target_type === 'comment' && r[0].reason === 'spam', JSON.stringify(r))
    check('hộp đã đóng sau khi gửi được', !a.visible('Báo cáo bình luận'))
  } finally {
    await rest.del(`user_reports?reporter_id=eq.${me.id}&target_id=in.(${commentIds.join(',')})`).catch(() => {})
    for (const c of created) await asOther(`/api/reviews/${c.postId}/comments/${c.id}`, { method: 'DELETE' }).catch(() => {})
  }
}
