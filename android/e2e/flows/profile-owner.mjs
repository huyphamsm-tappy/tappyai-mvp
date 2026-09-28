// (g) The owner's own profile (Tôi) shows every state of their content, like web /profile (P2b):
// Đã đăng · Đã chia sẻ · Đã lưu · Bị hạn chế · Đã ẩn · Địa điểm. The seed gives the Pro account
// 2 published, 2 shared, 2 saved, 1 restricted, 1 hidden post and no saved place.
export const webAccount = 'e2e.android.pro@example.com'

export const TABS = [['Đã đăng', 2], ['Đã chia sẻ', 2], ['Đã lưu', 2], ['Bị hạn chế', 1], ['Đã ẩn', 1], ['Địa điểm', 0]]

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.pro.email)
  await a.tap('Tôi', { after: 5000 })
  shot('hub')
  const first = await a.scrollTo('Đã đăng', { max: 6 })
  // The hub's segment row scrolls sideways; collect every label it holds, in order.
  const seen = []
  for (let i = 0; i < 5; i++) {
    for (const n of a.dump().filter((x) => Math.abs(x.y1 - first.y1) < 60 && x.text)) if (!seen.includes(n.text)) seen.push(n.text)
    a.sh('input', 'swipe', '650', String(first.y1 + 30), '120', String(first.y1 + 30), '400'); await a.sleep(700)
  }
  const order = TABS.map(([t]) => seen.indexOf(t))
  check('đủ 6 tab như web, đúng thứ tự', order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), seen.join(' · '))
  check('không có tab "Đã thích" (web không có)', !seen.includes('Đã thích'))
  for (const [tab, n] of TABS) {
    const ROW = /^(Đã đăng|Đã chia sẻ|Đã lưu|Bị hạn chế|Đã ẩn|Đã thích|Địa điểm)$/
    await a.scrollTo(ROW, { max: 6 }).catch(() => null)
    const t = await a.scrollRowTo(tab, ROW).catch((e) => { console.log('   ', e.message); return null })
    if (!t) { check(`${tab}: có tab`, false); continue }
    await a.tap(t, { after: 3500 })
    // The cards sit below the segment row: scroll the page so the row is near the top.
    a.sh('input', 'swipe', '540', '1600', '540', '700', '600'); await a.sleep(1200)
    shot(`tab-${tab}`)
    // Cards carry their place name ("Phở Chính Chủ (E2E)", possibly cut to "… (E…").
    const count = a.texts().filter((x) => /\(E(2E\)|…|\.\.\.)|\(E$/.test(x)).length
    check(`${tab}: ${n} mục`, count === n, `${count} thẻ`)
    a.swipe('down'); await a.sleep(700)
  }
}

export async function web({ w, page, shot, check }) {
  await w.go('/profile', 3000)
  await page.getByText('Đã đăng').first().waitFor({ timeout: 30000 })
  await shot('hub')
  const body = await page.locator('body').innerText()
  const order = TABS.map(([t]) => body.indexOf(t))
  check('đủ 6 tab, đúng thứ tự', order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), order.join(','))
  for (const [tab, n] of TABS) {
    await page.getByRole('button', { name: new RegExp(`^${tab}`) }).first().click().catch(() => page.getByText(tab, { exact: true }).first().click())
    await page.waitForTimeout(2500)
    await shot(`tab-${tab}`, true)
    const text = await page.locator('main').innerText().catch(() => page.locator('body').innerText())
    const cards = (text.match(/\(E2E\)/g) || []).length
    check(`${tab}: ${n} mục`, n === 0 ? cards === 0 : cards >= n, `${cards} thẻ (E2E)`)
  }
}
