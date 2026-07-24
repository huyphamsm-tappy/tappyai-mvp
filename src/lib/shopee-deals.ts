export interface Deal {
  title: string
  category: string
  discount: string
  url: string
  source: string
  emoji: string
  badge?: string   // e.g. "HOT", "MỚI" — no false-scarcity/countdown badges (MFS 3.10: no manufactured urgency)
}

// Curated Vietnamese e-commerce/travel entries. Every URL is render-audited (not
// just HTTP 200) to land on a real, usable page whose CONTENT matches the title —
// a stable marketplace/category/promotion page, never a campaign deep-link (those
// expire, geo-route, A/B-test and soft-404). Titles that could only be satisfied
// by a volatile campaign page are generalized to the platform ("Sàn mua sắm", "Đi
// chợ online") so title and destination always describe the same thing. Discount
// copy is descriptive, not a fabricated fixed number the landing page can't honor
// (MFS 3.10: no manufactured urgency / false claims).
const DEAL_POOL: Deal[] = [
  // Marketplaces (generalized — homepage, always browsable)
  { title: 'Shopee — Sàn mua sắm online', category: 'Mua sắm', discount: 'Voucher, Flash Sale & Freeship mỗi ngày', url: 'https://shopee.vn', source: 'Shopee', emoji: '🛍️' },
  { title: 'Lazada — Sàn mua sắm online', category: 'Mua sắm', discount: 'Flash Sale, voucher & giá tốt mỗi ngày', url: 'https://www.lazada.vn', source: 'Lazada', emoji: '🛒' },
  { title: 'WinMart — Đi chợ online', category: 'Siêu thị', discount: 'Đi chợ online, giao nhanh 62 tỉnh thành', url: 'https://winmart.vn', source: 'WinMart', emoji: '🏪' },
  // Category pages (content matches the title)
  { title: 'Nhà sách Tiki', category: 'Sách', discount: 'Giảm giá & freeship nhiều đầu sách', url: 'https://tiki.vn/nha-sach-tiki/c8322', source: 'Tiki', emoji: '📚' },
  { title: 'Điện thoại & máy tính bảng Tiki', category: 'Điện tử', discount: 'Chính hãng, trả góp 0%, giá tốt', url: 'https://tiki.vn/dien-thoai-may-tinh-bang/c1789', source: 'Tiki', emoji: '📱' },
  { title: 'Điện thoại Thế Giới Di Động', category: 'Điện tử', discount: 'Chính hãng, trả góp 0%, thu cũ đổi mới', url: 'https://www.thegioididong.com/dtdd', source: 'TGDĐ', emoji: '📲' },
  { title: 'Laptop FPT Shop', category: 'Điện tử', discount: 'Trả góp 0% + quà tặng kèm laptop', url: 'https://fptshop.com.vn/may-tinh-xach-tay', source: 'FPT Shop', emoji: '💻' },
  // Promotion pages (real, stable)
  { title: 'Khuyến mãi CellphoneS', category: 'Điện tử', discount: 'Danh sách khuyến mãi cập nhật liên tục', url: 'https://cellphones.com.vn/khuyen-mai.html', source: 'CellphoneS', emoji: '🏷️' },
  { title: 'Khuyến mãi Bách Hoá Xanh', category: 'Siêu thị', discount: 'Flash Sale & combo giá sỉ mỗi ngày', url: 'https://www.bachhoaxanh.com/khuyen-mai', source: 'BHX', emoji: '🥬' },
  { title: 'Ưu đãi khách sạn Agoda', category: 'Du lịch', discount: 'Mã giảm giá & ưu đãi khách sạn mỗi ngày', url: 'https://www.agoda.com/vi-vn/deals', source: 'Agoda', emoji: '🏨' },
  // Travel platforms (generalized — homepage)
  { title: 'Traveloka — Đặt vé & khách sạn', category: 'Du lịch', discount: 'Đặt vé máy bay & khách sạn giá tốt', url: 'https://www.traveloka.com/vi-vn', source: 'Traveloka', emoji: '✈️' },
  { title: 'Vinpearl — Nghỉ dưỡng & resort', category: 'Du lịch', discount: 'Đặt phòng resort & combo nghỉ dưỡng', url: 'https://vinpearl.com', source: 'VinPearl', emoji: '🌴' },
  // Food delivery
  { title: 'GrabFood', category: 'Ăn uống', discount: 'Đặt đồ ăn, ưu đãi & freeship theo khu vực', url: 'https://food.grab.com/vn/vi/', source: 'GrabFood', emoji: '🍔' },
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
