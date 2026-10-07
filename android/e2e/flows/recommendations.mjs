// (j) "Gợi ý cho bạn" = D:/redesign Sep 22 01_41 = web /recommendations: hero, highlights, section
// "Địa điểm nổi bật gần đây · Xem thêm", cards with facts + "Hỏi Tappy về chỗ này", footer. The ask
// button opens Chat with "Kể mình nghe về <place>".
export const webAccount = 'e2e.android.pro@example.com'

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.pro.email)
  await a.tap('Trang chủ', { after: 1500 })
  await a.scrollTo('Gợi ý địa điểm du lịch')
  await a.tap('Gợi ý địa điểm du lịch', { after: 7000 })
  shot('recommendations')
  const t = a.texts().join(' | ')
  check('tiêu đề "Gợi ý cho bạn"', t.includes('Gợi ý cho bạn'))
  check('hero "Khám phá những địa điểm nổi bật gần bạn"', /Khám phá những địa điểm nổi bật/.test(t) && t.includes('gần bạn'))
  check('3 điểm nhấn', t.includes('Khám phá địa điểm mới') && t.includes('Kết nối cộng đồng') && t.includes('Trải nghiệm cuộc sống xung quanh'))
  check('mục "Địa điểm nổi bật gần đây" + "Xem thêm"', /Địa điểm (nổi bật gần đây|hợp gu)/.test(t) && t.includes('Xem thêm'))
  check('thẻ có nút "Hỏi Tappy về chỗ này"', a.visible('Hỏi Tappy về chỗ này'))
  check('thẻ có chip đánh giá / hoạt động', /\d\.\d/.test(t) && (t.includes('Hoạt động gần đây') || /\d+ đánh giá/.test(t)))
  check('không lộ chữ tiếng Anh của engine (Recently Active / Near)', !t.includes('Recently Active') && !/\bNear\b/.test(t))
  // R19 (web 0399988): a RESTRICTED post never becomes a suggestion — the seed's pro_restricted row.
  const restricted = await a.scrollTo('Bài Bị Hạn Chế (E2E)', { max: 6 }).then(() => true, () => false)
  check('không gợi ý bài bị hạn chế (R19)', !restricted)
  // E2E_NO_AI=1: stop before "Hỏi Tappy về chỗ này", which sends a real chat turn.
  if (process.env.E2E_NO_AI) return
  const first = a.find(/Phở|Cà Phê|Bánh Mì|Quán|Spa|Tiệm|Clip/)
  const place = first?.text || ''
  await a.tap('Hỏi Tappy về chỗ này', { after: 6000 })
  shot('ask-tappy')
  check('mở Chat với "Kể mình nghe về …"', a.visible(/^Kể mình nghe về /), place)
}

export async function web({ w, page, shot, check }) {
  await w.go('/recommendations', 4000)
  await page.getByText('Hỏi Tappy về chỗ này').first().waitFor({ timeout: 30000 })
  await shot('recommendations', true)
  const t = await page.locator('body').innerText()
  check('hero "Khám phá những địa điểm nổi bật gần bạn"', t.includes('Khám phá những địa điểm nổi bật'))
  check('thẻ có nút "Hỏi Tappy về chỗ này"', t.includes('Hỏi Tappy về chỗ này'))
  await page.getByText('Hỏi Tappy về chỗ này').first().click()
  await page.waitForTimeout(6000)
  await shot('ask-tappy')
  check('mở /chat với câu hỏi', new URL(page.url()).pathname === '/chat' && /Kể mình nghe về/.test(await page.locator('body').innerText()))
}
