// Layout comparison: the SAME screens on Android (emulator) and on the web (Playwright, 412x915 mobile, dark, vi),
// both against UAT with the SAME account, one screenshot per screen under the SAME name, so scripts/sbs.mjs can put
// them side by side. No AI call, nothing written (read-only browsing).
export const webAccount = 'e2e.android.pro@example.com'

const SCREENS = ['home', 'chat-empty', 'explore', 'deals', 'profile', 'settings', 'scamshield', 'composer', 'login']

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.pro.email)
  await a.tap('Trang chủ', { after: 4000 })
  shot('home')
  await a.tap('Chat', { after: 3500 })
  shot('chat-empty')
  await a.tap('Khám phá', { after: 6000 })
  shot('explore')
  // The composer: the only square button left of search in Explore's header.
  const plus = a.dump().filter((n) => n.clickable && n.y1 < 400 && n.x2 - n.x1 < 160 && n.x2 - n.x1 > 80).sort((x, y) => x.x1 - y.x1)[0]
  if (plus) { await a.tap(plus, { after: 3000 }); shot('composer'); await a.back() }
  await a.tap('Deals', { after: 5000 })
  shot('deals')
  await a.tap('Tôi', { after: 4000 })
  shot('profile')
  // Settings row: scroll the page with upward swipes (a downward swipe from the top edge pulls the notification shade).
  let st = a.find('Cài đặt')
  for (let i = 0; i < 8 && !(st && st.y1 > 250 && st.y2 < 2050); i++) { a.swipe('up'); await a.sleep(800); st = a.find('Cài đặt') }
  if (st) { await a.tap(st, { after: 3500 }); shot('settings'); await a.back() }
  // ScamShield: from Home's tools.
  await a.tap('Trang chủ', { after: 3000 })
  let scam = a.find(/Kiểm tra link/)
  for (let i = 0; i < 6 && !(scam && scam.y1 > 250 && scam.y2 < 2050); i++) { a.swipe('up'); await a.sleep(900); scam = a.find(/Kiểm tra link/) }
  if (scam) { await a.tap(scam, { after: 4000 }); shot('scamshield'); await a.back() }
  // Signed-out login screen.
  await a.signOut().catch(() => {})
  await a.tap('Tôi', { after: 3000 }).catch(() => {})
  const gate = a.find('Đăng nhập để lưu lại')
  if (gate) await a.tap(gate, { after: 3500 })
  shot('login')
  check('đã chụp các màn Android để so với web', true, SCREENS.join(', '))
}

export async function web({ w, page, shot, check }) {
  await w.go('/', 5000); await shot('home')
  await w.go('/chat', 5000); await shot('chat-empty')
  await w.go('/reviews', 7000); await shot('explore')
  await w.go('/reviews/new', 4000); await shot('composer')
  await w.go('/deals', 6000); await shot('deals')
  await w.go('/profile', 5000); await shot('profile')
  await w.go('/profile/settings', 5000); await shot('settings')
  await w.go('/scam-shield', 5000); await shot('scamshield')
  await page.context().clearCookies()
  await w.go('/login', 5000); await shot('login')
  check('đã chụp các màn web để so với Android', true, SCREENS.join(', '))
}
