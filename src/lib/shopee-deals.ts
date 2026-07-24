export interface Deal {
  title: string
  category: string
  discount: string
  url: string
  source: string
  emoji: string
  badge?: string   // e.g. "HOT", "MỚI" — no false-scarcity/countdown badges (MFS 3.10: no manufactured urgency)
}

// Curated partner catalog (product decision 2026-07-24): a small set of stable,
// well-known partners linked ONLY to their official landing page — never a
// campaign, seasonal-promotion, search, or expiring deep link. Every URL is
// render-audited to open the partner's real homepage/official page. Copy is a
// neutral description of what the partner does (no fabricated discount numbers a
// landing page can't honor — MFS 3.10). `discount` is used as the subtitle line.
const DEAL_POOL: Deal[] = [
  // Shopping
  { title: 'Shopee', category: 'Mua sắm', discount: 'Sàn mua sắm online — mọi thứ bạn cần', url: 'https://shopee.vn', source: 'Shopee', emoji: '🛍️' },
  { title: 'ShopeeFood', category: 'Mua sắm', discount: 'Đặt đồ ăn & đi chợ, giao tận nơi', url: 'https://shopeefood.vn', source: 'ShopeeFood', emoji: '🍜' },
  { title: 'TikTok Shop', category: 'Mua sắm', discount: 'Mua sắm giải trí ngay trên TikTok', url: 'https://www.tiktok.com/shop', source: 'TikTok Shop', emoji: '🎬' },
  // Ride & Delivery
  { title: 'Grab', category: 'Vận chuyển', discount: 'Đặt xe, giao đồ ăn & giao hàng', url: 'https://www.grab.com/vn/', source: 'Grab', emoji: '🚗' },
  { title: 'Be', category: 'Vận chuyển', discount: 'Ứng dụng gọi xe & giao hàng Việt', url: 'https://be.com.vn', source: 'Be', emoji: '🛵' },
  // Travel
  { title: 'Agoda', category: 'Du lịch', discount: 'Đặt khách sạn & vé máy bay giá tốt', url: 'https://www.agoda.com/vi-vn', source: 'Agoda', emoji: '🏨' },
  { title: 'Booking.com', category: 'Du lịch', discount: 'Đặt phòng & chỗ nghỉ khắp thế giới', url: 'https://www.booking.com/index.vi.html', source: 'Booking.com', emoji: '🛎️' },
]

// Rotate based on current date — same deals all day, new set every day
function getDailyDeals(count = 6): Deal[] {
  const today = new Date()
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()

  // Deterministic shuffle by day
  const shuffled = [...DEAL_POOL]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (seed * (i + 1) * 2654435761) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}

export async function getShopeeDeals(): Promise<Deal[]> {
  // Shopee's flash_sale API requires cookies/session — not accessible publicly.
  // Return daily-rotating curated deals with real platform URLs.
  return getDailyDeals(7)
}

// For the cron AI personalization — returns a larger pool to give Haiku more to work with
export async function getDealsForPersonalization(): Promise<Deal[]> {
  return getDailyDeals(12)
}
