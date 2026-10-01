// 01/10 — «Thông báo đẩy» OFF must switch the SERVER subscription off (DELETE /api/notifications/subscribe with this
// device's FCM token), ON again must re-register (POST). Verified on the AUDIT database with an account test:
//   signed-in device registers at sign-in → switch OFF → row enabled=false → switch ON → row enabled=true.
// The failure path (no network → the switch stays ON and says so) is unit-tested (PushOffTest); toggling the emulator's
// network is avoided on purpose (it does not come back reliably).
import { rest } from '../lib/supabase.mjs'

const SWITCH = 'Bật/tắt thông báo đẩy'

async function rowEnabled(userId) {
  const rows = await rest.get(`notification_subscriptions?select=enabled,provider&user_id=eq.${userId}&provider=eq.fcm`)
  return rows.length ? rows[0].enabled : null
}

async function waitRow(userId, want, ms = 60000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if ((await rowEnabled(userId)) === want) return true
    await new Promise((r) => setTimeout(r, 3000))
  }
  return false
}

export async function android({ a, shot, check, seeded }) {
  const user = seeded.users.other
  a.sh('pm', 'grant', a.PKG, 'android.permission.POST_NOTIFICATIONS')
  await rest.del(`notification_subscriptions?user_id=eq.${user.id}`).catch(() => {})
  await a.signIn(user.email)
  check('đăng nhập → thiết bị tự đăng ký FCM (server: enabled=true)', await waitRow(user.id, true))

  await a.tap('Tôi', { after: 2500 })
  await a.scrollTo('Cài đặt')
  await a.tap('Cài đặt', { after: 3500 })
  const row = await a.scrollTo(/^Thông báo$/, { max: 10 }).catch(() => null)
  if (!row) { check('mở được màn Thông báo từ Cài đặt', false); return }
  await a.tap(row, { after: 3000 })
  shot('notifications-on')
  check('màn Thông báo có công tắc «Thông báo đẩy»', a.visible(/Thông báo đẩy/) && !!a.find(SWITCH))

  await a.tap(SWITCH, { after: 6000 })
  shot('notifications-off')
  check('tắt công tắc → SERVER ngừng gửi cho máy này (enabled=false)', await waitRow(user.id, false, 30000))
  check('công tắc hiện TẮT, không có dòng lỗi', !a.visible(/Chưa tắt được thông báo/))

  await a.tap(SWITCH, { after: 6000 })
  shot('notifications-on-again')
  check('bật lại → đăng ký lại (enabled=true)', await waitRow(user.id, true, 40000))
  await rest.del(`notification_subscriptions?user_id=eq.${user.id}`).catch(() => {})
}

// No web twin: the web's push is a different transport (webpush) with its own tests.
