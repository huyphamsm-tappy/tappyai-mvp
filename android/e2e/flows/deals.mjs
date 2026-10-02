// (j) Deals = web DealsView: "Deal hôm nay", the "Hỏi Tappy trước khi mua" card even when the feed is
// empty (it is on UAT), and its CTA opening an EMPTY chat (nothing pre-filled, nothing sent).
export const webAccount = 'e2e.android.free@example.com'

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.free.email)
  await a.tap('Deals', { after: 5000 })
  shot('deals')
  check('tiêu đề "Deal hôm nay"', a.visible('Deal hôm nay'))
  check('thẻ "Hỏi Tappy trước khi mua"', a.visible('Hỏi Tappy trước khi mua'))
  const empty = a.visible('Chưa có ưu đãi nào. Quay lại sau nhé!')
  check('trạng thái rỗng giống web (hoặc có deal)', empty || a.visible(/Nổi bật|Featured/))
  await a.tap('Hỏi Tappy ngay', { after: 4000 })
  shot('chat-opened')
  check('mở Chat', a.visible('Nhắn tin cho Tappy…'))
  check('không tự gửi câu hỏi nào', !a.visible(/Tappy tư vấn giúp mình/))
}

export async function web({ w, page, shot, check }) {
  await w.go('/deals', 5000)
  await shot('deals', true)
  const t = await page.locator('body').innerText()
  check('tiêu đề "Deal hôm nay"', t.includes('Deal hôm nay'))
  check('thẻ "Hỏi Tappy trước khi mua"', t.includes('Hỏi Tappy trước khi mua'))
  await page.getByText('Hỏi Tappy ngay').first().click()
  await page.waitForTimeout(3500)
  await shot('chat-opened')
  check('mở /chat', new URL(page.url()).pathname === '/chat')
}
