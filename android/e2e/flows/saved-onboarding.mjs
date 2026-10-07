// Owner decisions 2026-09-28 (ANDROID-REQUESTS): Đã lưu = hero + chips Tất cả / Địa điểm / Bài viết /
// Video ONLY (Deals and Bộ sưu tập hidden, no "Sắp có"), two count cards; onboarding counter = the
// real steps, "Bước 1/2" → "Bước 2/2". The seed gives the Pro account 2 saved posts (1 of them a
// video) and no saved place; the `fresh` account starts every run not onboarded.
export const webAccount = 'e2e.android.pro@example.com'

const CHIPS = ['Tất cả', 'Địa điểm', 'Bài viết', 'Video']

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.pro.email)
  await a.tap('Tôi', { after: 2500 })
  // "Đã lưu" is also a profile-content tab; the Saved SCREEN is the menu row below it (by "Lịch sử chat").
  await a.scrollTo('Lịch sử chat')
  a.swipe('up'); await a.sleep(1200)
  const row = a.dump().filter((n) => (n.text || n.desc) === 'Đã lưu' && n.y2 > n.y1).pop()
  await a.tap(row, { after: 4000 })
  shot('saved-hub')
  const t = a.texts()
  check('hero "Những điều bạn yêu thích 💙"', t.some((s) => s.startsWith('Những điều bạn yêu thích')))
  check('chip Tất cả / Địa điểm / Bài viết / Video', CHIPS.every((c) => t.includes(c)))
  check('KHÔNG có chip Deals / Bộ sưu tập / Sắp có', t.filter((x) => x === 'Deals').length === 1 /* only the bottom-nav tab */ && !t.includes('Bộ sưu tập') && !t.includes('Sắp có'))
  check('2 thẻ đếm: Địa điểm yêu thích 0 · Bài viết đã lưu 2', t.includes('Địa điểm yêu thích') && t.includes('Bài viết đã lưu') && t.includes('0') && t.includes('2'))

  await a.tap('Video', { after: 2500 })
  shot('saved-videos')
  check('chip Video → "Video đã lưu" với 1 clip', a.visible('Video đã lưu') && a.visible('Clip Người Khác (E2E)') && !a.visible('Phở Người Khác (E2E)'))
  await a.tap('Bài viết', { after: 2500 })
  check('chip Bài viết → 2 bài', a.visible('Clip Người Khác (E2E)') && a.visible('Phở Người Khác (E2E)'))
  await a.back()
  check('Back từ bộ lọc → về Tất cả (2 thẻ đếm)', a.visible('Bài viết đã lưu') && a.visible('Địa điểm yêu thích') && a.visible('Những điều bạn yêu thích 💙'))
  await a.back()
  check('Back lần nữa → về Tôi', a.visible('Đã lưu') && !a.visible('Những điều bạn yêu thích 💙'))

  // Onboarding: the fresh account lands on the wizard.
  await a.signInFromLogin(seeded.users.fresh.email)
  const step1 = await a.waitFor('Bước 1/2', { timeout: 40000 })
  shot('onboarding-step1')
  check('Onboarding bước 1 hiện "Bước 1/2"', !!step1)
  await a.tap('Ăn uống', { after: 1000 }) // "Tiếp theo" is enabled once an interest is picked
  await a.scrollTo('Tiếp theo').catch(() => {})
  const next = a.find(/^Tiếp tục|^Tiếp theo/)
  if (next) {
    await a.tap(next, { after: 2500 })
    shot('onboarding-step2')
    await a.scrollTo('Bước 2/2').catch(() => {})
    check('Onboarding bước 2 hiện "Bước 2/2"', a.visible('Bước 2/2'))
    // Finish (Bỏ qua posts the same request, like the web) → the app; the account is onboarded now.
    await a.scrollTo('Bỏ qua').catch(() => {})
    await a.tap('Bỏ qua', { after: 5000 })
    shot('onboarding-done')
    check('Xong onboarding → vào Trang chủ', a.visible('Trang chủ'))
  } else check('Onboarding có nút sang bước 2', false, a.texts().slice(0, 12).join('|'))
}

export async function web({ w, page, shot, check }) {
  await w.go('/profile/favorites', 5000)
  await shot('saved-hub', true)
  const chips = await page.$$eval('[data-saved-chip]', (els) => els.map((e) => e.getAttribute('data-saved-chip')))
  check('chip all / places / posts / videos (không deals / collections)', JSON.stringify(chips) === JSON.stringify(['all', 'places', 'posts', 'videos']), chips.join(','))
  const counts = await page.$$eval('[data-saved-count]', (els) => els.map((e) => `${e.getAttribute('data-saved-count')}=${e.textContent.trim()}`))
  check('2 thẻ đếm places=0 · posts=2', counts.join(',') === 'places=0,posts=2', counts.join(','))
  await w.go('/profile/favorites?type=videos', 4000)
  await shot('saved-videos')
  const posts = await page.$$eval('[data-saved-post]', (els) => els.length)
  check('?type=videos → 1 clip', posts === 1, String(posts))
  // The wizard itself (opened directly — it is a page for any signed-in user).
  await w.go('/onboarding', 5000)
  await shot('onboarding-step1')
  const label = await page.$eval('[data-testid=onboarding-progress]', (e) => e.getAttribute('aria-label')).catch(() => '')
  check('onboarding "Bước 1/2"', label === 'Bước 1/2', label)
}
