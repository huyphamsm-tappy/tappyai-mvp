// (g) Another user's profile, seen by the Pro account: only public content, two tabs
// "Bài đăng" · "Chia sẻ" (web PublicProfileView VISITOR_TAB_ORDER). The hidden post never shows.
export const webAccount = 'e2e.android.pro@example.com'

const PUBLIC = ['Phở Người Khác (E2E)', 'Bánh Mì Người Khác (E2E)', 'Clip Người Khác (E2E)']
const HIDDEN = 'Bài Ẩn Người Khác (E2E)'

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.pro.email)
  await a.tap('Tôi', { after: 4000 })
  await a.scrollTo('E2E Người khác', { max: 12 })
  await a.tap('E2E Người khác', { after: 5000 })
  shot('visitor-posts')
  const all = () => a.texts().join(' | ')
  check('mở đúng hồ sơ người khác', a.visible('E2E Người khác'))
  check('có tab "Bài đăng"', a.visible('Bài đăng'))
  check('có tab "Chia sẻ"', a.visible('Chia sẻ'))
  check('không có tab riêng tư (Đã lưu/Đã ẩn/Đã thích)', !a.visible('Đã ẩn') && !a.visible('Đã thích'))
  // Web tabCount: each visitor tab carries its count — "Bài đăng 3", "Chia sẻ 1".
  const tx = a.texts()
  const after = (label) => tx[tx.lastIndexOf(label) + 1]
  check('số đếm tab: Bài đăng 3 · Chia sẻ 1 (như web)', after('Bài đăng') === '3' && after('Chia sẻ') === '1', `${after('Bài đăng')} / ${after('Chia sẻ')}`)
  // Tiles carry no text on Android (image + like count), so the grid is counted: the seed gives this
  // account 3 public posts with a place, 1 share-only post and 1 HIDDEN post.
  const postTiles = a.tiles().length
  check('Bài đăng: đúng 3 bài công khai (bài ẩn và bài chia sẻ không nằm ở đây)', postTiles === 3, `${postTiles} ô`)
  check('Bài đăng: KHÔNG có chữ của bài đã ẩn', !all().includes(HIDDEN))
  await a.tap('Chia sẻ', { after: 2500 })
  shot('visitor-shares')
  const shareTiles = a.tiles().length
  check('Chia sẻ: đúng 1 bài không gắn địa điểm', shareTiles === 1, `${shareTiles} ô`)
  await a.back()
}

export async function web({ w, page, shot, check, seeded }) {
  await w.go(`/users/${seeded.users.other.id}`, 2000)
  await page.getByText('E2E Người khác').first().waitFor({ timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await shot('visitor-posts', true)
  const body = async () => page.locator('body').innerText()
  const posts = await body()
  check('mở đúng hồ sơ người khác', posts.includes('E2E Người khác'))
  check('có tab "Bài đăng" và "Chia sẻ"', posts.includes('Bài đăng') && posts.includes('Chia sẻ'))
  check('Bài đăng: thấy bài công khai', PUBLIC.every((p) => posts.includes(p)), PUBLIC.filter((p) => !posts.includes(p)).join(', '))
  check('Bài đăng: KHÔNG thấy bài đã ẩn', !posts.includes(HIDDEN))
  await page.getByRole('button', { name: /Chia sẻ/ }).first().click().catch(() => page.getByText('Chia sẻ').first().click())
  await page.waitForTimeout(1500)
  await shot('visitor-shares', true)
  const shares = await body()
  check('Chia sẻ: không còn bài có địa điểm', !PUBLIC.some((p) => shares.includes(p)))
}
