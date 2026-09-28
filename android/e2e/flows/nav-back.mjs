// (c) Back from every main screen lands on the screen before it; nothing leaves the app except Back
// on Trang chủ itself (the Android convention for the start tab). The web twin walks the same
// screens with browser Back.
export const webAccount = 'e2e.android.pro@example.com'

const HOME = /^Hi E2E Pro|^Chào bạn/

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.pro.email)
  const inApp = () => a.foreground().includes('com.tappyai.app.MainActivity')
  const onHome = () => inApp() && !!a.find(HOME)

  for (const tab of ['Chat', 'Khám phá', 'Deals', 'Tôi']) {
    await a.tap('Trang chủ', { after: 2000 })
    await a.tap(tab, { after: 3000 })
    shot(`tab-${tab}`)
    await a.back()
    check(`Back từ tab ${tab} → Trang chủ, không thoát app`, onHome())
  }

  const nested = [
    ['Tôi', 'Cài đặt', 'Cài đặt'],
    ['Tôi', 'Đã lưu', 'Đã lưu'],
    ['Tôi', 'Lịch sử chat', 'Lịch sử chat'],
    ['Trang chủ', 'Viết caption bằng AI', 'Viết caption bằng AI'],
    ['Trang chủ', 'Gợi ý địa điểm du lịch', 'Gợi ý địa điểm du lịch'],
  ]
  for (const [tab, row, label] of nested) {
    await a.tap(tab, { after: 2500 })
    const parent = a.texts().slice(0, 6).join('|')
    await a.scrollTo(row)
    await a.tap(row, { after: 3500 })
    shot(`open-${label}`)
    await a.back()
    const now = a.texts().slice(0, 12).join('|')
    check(`Back từ "${label}" → về lại ${tab}`, inApp() && (tab === 'Trang chủ' ? !!a.find(HOME) : a.visible('Chỉnh sửa hồ sơ') || now.includes('TÀI KHOẢN') || now.includes(row)), parent.slice(0, 60))
  }

  // Explore → creator profile → Back; Explore → composer → Back.
  await a.tap('Khám phá', { after: 4000 })
  const avatar = a.find(/^Ảnh đại diện của /)
  if (avatar) {
    await a.tap(avatar, { after: 4000 })
    shot('explore-creator')
    await a.back()
    check('Back từ hồ sơ tác giả → Khám phá', inApp() && a.visible('Đề xuất'))
  } else check('Khám phá có bài để mở hồ sơ tác giả', false)

  await a.tap('Trang chủ', { after: 2000 })
  await a.back()
  check('Back ở Trang chủ rời app (quy ước Android)', !inApp())
  await a.launch()
}

export async function web({ w, page, shot, check }) {
  await w.go('/', 5000)
  for (const [path, label] of [['/chat', 'Chat'], ['/reviews', 'Khám phá'], ['/deals', 'Deals'], ['/profile', 'Tôi'],
    ['/profile/settings', 'Cài đặt'], ['/profile/favorites', 'Đã lưu'], ['/profile/history', 'Lịch sử chat'], ['/viet-content', 'Viết content'], ['/recommendations', 'Gợi ý cho bạn']]) {
    await w.go('/', 3000)
    await w.go(path, 4000)
    await shot(`open-${label}`)
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    check(`Back từ ${label} → Trang chủ`, new URL(page.url()).pathname === '/', new URL(page.url()).pathname)
  }
}
