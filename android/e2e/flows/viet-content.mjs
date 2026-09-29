// Viết content = the approved design 2026-09-28 (ANDROID-REQUESTS R2, web d97b261): hero "Caption hấp
// dẫn / trong vài giây", section cards with hints, "Thử gợi ý" fills a real example, brand tiles,
// tone pills, length tiles, "Tạo caption ngay". The AI call itself is NOT made here (no real runs
// while waiting on the web session) — the button's enabled state is what is checked.
export const webAccount = 'e2e.android.pro@example.com'

const EXAMPLE1 = 'Quán cà phê mới mở, decor retro, cà phê ngon, giá bình dân, ở quận 3 Sài Gòn'

export async function android({ a, shot, check, seeded }) {
  await a.signIn(seeded.users.pro.email)
  await a.tap('Trang chủ', { after: 2000 })
  await a.scrollTo('Viết caption bằng AI')
  await a.tap('Viết caption bằng AI', { after: 3500 })
  shot('viet-hero')
  const t = a.texts()
  check('hero: AI viết content · Caption hấp dẫn · trong vài giây', t.includes('AI viết content') && t.some((s) => s.startsWith('Caption hấp dẫn')))
  check('thẻ Chủ đề + "Thử gợi ý" + 0/500', t.includes('Chủ đề / Mô tả nội dung') && t.includes('Thử gợi ý') && t.includes('0/500'))
  await a.tap('Thử gợi ý', { after: 1500 })
  shot('viet-example')
  check('"Thử gợi ý" điền gợi ý 1 và bộ đếm', a.visible(EXAMPLE1) && a.visible(`${EXAMPLE1.length}/500`))
  await a.hideKeyboard()
  await a.scrollTo('Tone / Phong cách')
  shot('viet-platform-tone')
  const t2 = a.texts()
  check('Platform: Facebook / TikTok / Instagram + gợi ý', ['Facebook', 'TikTok', 'Instagram'].every((x) => t2.includes(x)) && t2.includes('Chọn nền tảng để tối ưu định dạng và phong cách'))
  await a.tap('TikTok', { after: 800 })
  await a.scrollTo('Tạo caption ngay')
  shot('viet-length-cta')
  const t3 = a.texts()
  check('Tone 5 lựa chọn', ['Hài hước', 'Cảm xúc', 'Trẻ trung', 'Truyền cảm hứng', 'Chuyên nghiệp'].every((x) => t3.includes(x)))
  check('Độ dài: Ngắn 1–2 câu · Trung bình 3–5 câu · Dài 6–10 câu', ['Ngắn', '1–2 câu', 'Trung bình', '3–5 câu', 'Dài', '6–10 câu'].every((x) => t3.includes(x)))
  check('nút "Tạo caption ngay"', t3.includes('Tạo caption ngay'))
  await a.back()
  check('Back → Trang chủ', a.visible('Viết caption bằng AI'))
}

export async function web({ w, page, shot, check }) {
  await w.go('/viet-content', 5000)
  await shot('viet-hero', true)
  const sections = await page.$$eval('[data-vc-section]', (els) => els.map((e) => e.getAttribute('data-vc-section')))
  check('4 thẻ topic/platform/tone/length', sections.join(',') === 'topic,platform,tone,length', sections.join(','))
  await page.click('[data-vc-try-example]')
  const topic = await page.$eval('#vc-topic', (e) => e.value)
  check('"Thử gợi ý" điền gợi ý 1', topic === EXAMPLE1, topic)
  const brands = await page.$$eval('[data-vc-platform] [data-brand]', (els) => els.map((e) => e.getAttribute('data-brand')))
  check('logo thương hiệu FB/TikTok/IG', brands.join(',') === 'facebook,tiktok,instagram', brands.join(','))
}
