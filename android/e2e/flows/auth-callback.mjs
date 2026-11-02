// MOB-1 (security HIGH, 30/09) — tappyai://auth-callback accepts a session ONLY for a sign-in this app
// started (app_state: random, stored encrypted, 5 min like the server I6 cookie, single use). No AI call, no password typed.
//  - the guarded path works: the test hook signs in exactly like Zalo (mints the state, then the callback);
//  - an unsolicited callback carrying ANOTHER account's real session — no state, or a wrong one — is refused:
//    the signed-in account stays;
//  - «Tiếp tục với Zalo» opens the backend flow WITH app_state (43 chars); «Tiếp tục với Google» is the native
//    Credential Manager flow (no browser, no callback; the emulator has no Google account, so no picker).
// Expired / reused states: unit test AuthCallbackStateGuardTest (a 5-minute wait has no place in e2e).
import { sessionFor } from '../lib/supabase.mjs'

const PKG = 'com.tappyai.app.staging'

export async function android({ a, shot, check, seeded }) {
  const whoAmI = async () => {
    a.sh('am', 'force-stop', PKG)
    await a.launch()
    await a.tap('Tôi', { after: 3000 })
    const t = a.texts()
    return t.includes(seeded.users.pro.email) ? 'pro' : t.includes(seeded.users.other.email) ? 'other' : 'unknown'
  }
  const deliver = (link) => a.adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${link}'`, PKG])

  await a.signIn(seeded.users.pro.email)
  check('đăng nhập đúng luồng (app tạo state → callback có state khớp) được nhận', (await whoAmI()) === 'pro')

  const s = await sessionFor(seeded.users.other.email)
  const tokens = `access_token=${encodeURIComponent(s.access_token)}&refresh_token=${encodeURIComponent(s.refresh_token)}`

  deliver(`tappyai://auth-callback#${tokens}`)
  await a.sleep(1200)
  shot('callback-no-state')
  check('callback KHÔNG có state (phiên của tài khoản khác) bị từ chối — vẫn là tài khoản cũ', (await whoAmI()) === 'pro')

  deliver(`tappyai://auth-callback#${tokens}&state=${'A'.repeat(43)}`)
  await a.sleep(1200)
  shot('callback-wrong-state')
  check('callback có state SAI bị từ chối — vẫn là tài khoản cũ', (await whoAmI()) === 'pro')

  deliver(`tappyai://auth-callback?code=attacker-code`)
  await a.sleep(1200)
  check('callback mã (code) không do app bắt đầu bị từ chối — vẫn là tài khoản cũ', (await whoAmI()) === 'pro')

  // «Tiếp tục với Zalo» from the login card (a guest reaches it through a locked row).
  await a.signOut()
  await a.tap('Tôi', { after: 3000 })
  await a.scrollTo('Tài khoản')
  await a.tap('Tài khoản', { after: 3500 })
  await a.tap('Tiếp tục với Zalo', { after: 4000 })
  shot('zalo-started')
  const acts = a.sh('dumpsys', 'activity', 'activities')
  const m = acts.match(/api\/auth\/zalo\?platform=android[^ \s}]*app_state=([A-Za-z0-9_-]+)/)
  check('«Tiếp tục với Zalo» mở luồng server KÈM app_state 43 ký tự', !!m && m[1].length === 43, m ? `app_state=${m[1].length} ký tự` : 'không thấy URL')
  // (The tab itself stops at UAT's Vercel protection on the emulator — no bypass in a browser; the server
  // step is checked directly in web() below, and a real Zalo login is on the real-device checklist.)
  await a.dismissForeign()
  await a.launch()

  // Back from the Zalo tab the app is still on the login card; otherwise reach it again.
  if (!a.find('Tiếp tục với Google')) {
    await a.tap('Tôi', { after: 3000 })
    await a.scrollTo('Tài khoản')
    await a.tap('Tài khoản', { after: 3500 })
  }
  await a.tap('Tiếp tục với Google', { after: 4000 })
  shot('google-started')
  const top = a.foreground()
  check('«Tiếp tục với Google» là luồng Credential Manager của hệ thống — không mở trình duyệt, không qua callback (emulator không có tài khoản Google nên không có bảng chọn; đăng nhập Google thật: kiểm máy thật)', !/chrome|browser/i.test(top), top.slice(0, 80))
  await a.back()
  await a.dismissForeign()
  await a.launch()
}

// Server half (I6): a forged native link — an attacker's own magic link with `platform=android` and no
// app_state — is refused by /auth/confirm BEFORE its token is used (no session, no redirect to the app).
export async function web({ check }) {
  const { UAT_BASE, bypassSecret } = await import('../lib/env.mjs')
  // The Zalo start (what the app opens): a well-formed app_state → on to Zalo + the app_login_state cookie;
  // a malformed one → /login?error=app_state_invalid, Zalo never opened.
  const good = await fetch(`${UAT_BASE}/api/auth/zalo?platform=android&returnTo=/&app_state=${'b'.repeat(43)}`, {
    redirect: 'manual', headers: { 'x-vercel-protection-bypass': bypassSecret() },
  })
  const gl = good.headers.get('location') || ''
  const cookie = (good.headers.get('set-cookie') || '')
  check('/api/auth/zalo với app_state hợp lệ → chuyển sang Zalo, đặt cookie app_login_state (httpOnly)', /zalo/i.test(new URL(gl, UAT_BASE).host) && /app_login_state=/.test(cookie) && /httponly/i.test(cookie), `${good.status} ${gl ? new URL(gl, UAT_BASE).host : '—'}`)
  const bad = await fetch(`${UAT_BASE}/api/auth/zalo?platform=android&returnTo=/&app_state=short`, {
    redirect: 'manual', headers: { 'x-vercel-protection-bypass': bypassSecret() },
  })
  const bl = bad.headers.get('location') || ''
  check('/api/auth/zalo với app_state sai dạng → /login?error=app_state_invalid, không mở Zalo', /app_state_invalid/.test(bl) && !/zalo/i.test(new URL(bl, UAT_BASE).host), `${bad.status} ${bl.replace(/\?.*/, '?…')}`)
  const r = await fetch(`${UAT_BASE}/auth/confirm?token_hash=forged-by-e2e&type=magiclink&platform=android`, {
    redirect: 'manual', headers: { 'x-vercel-protection-bypass': bypassSecret() },
  })
  const loc = r.headers.get('location') || ''
  check('/auth/confirm?platform=android KHÔNG có app_state → về /login?error=app_state_invalid, không về app', r.status >= 300 && r.status < 400 && /app_state_invalid/.test(loc) && !loc.startsWith('tappyai://'), `${r.status} ${loc.replace(/\?.*/, '?…')}`)
  const r2 = await fetch(`${UAT_BASE}/auth/confirm?token_hash=forged-by-e2e&type=magiclink&platform=android&app_state=${'A'.repeat(43)}`, {
    redirect: 'manual', headers: { 'x-vercel-protection-bypass': bypassSecret() },
  })
  const loc2 = r2.headers.get('location') || ''
  check('/auth/confirm với app_state KHÔNG khớp cookie → bị từ chối, không về app', /app_state_invalid/.test(loc2) && !loc2.startsWith('tappyai://'), `${r2.status} ${loc2.replace(/\?.*/, '?…')}`)
}
