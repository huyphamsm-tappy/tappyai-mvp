export interface Deal {
  title: string
  category: string
  discount: string
  url: string
  source: string
  emoji: string
  badge?: string   // e.g. "HOT", "MỚI", "HẾT HÔM NAY"
}

// Curated always-on Vietnamese e-commerce deals — verified real pages
const DEAL_POOL: Deal[] = [
  // Shopee
  { title: 'Flash Sale Shopee 0h', category: 'Điện tử', discount: 'Giảm đến 70%', url: 'https://shopee.vn/flash_sale', source: 'Shopee', emoji: '⚡', badge: 'HẾT HÔM NAY' },
  { title: 'Freeship toàn quốc không giới hạn', category: 'Vận chuyển', discount: 'Miễn phí ship đơn từ 0đ', url: 'https://shopee.vn/m/freeship-xtra', source: 'Shopee', emoji: '🚚' },
  { title: 'Voucher giảm giá Shopee hôm nay', category: 'Mua sắm', discount: 'Giảm 30k-100k đơn 99k+', url: 'https://shopee.vn/voucher', source: 'Shopee', emoji: '🎫' },
  { title: 'Shopee Xu đổi ưu đãi', category: 'Tiết kiệm', discount: 'Đổi 200 Xu giảm thêm tiền', url: 'https://shopee.vn/coin', source: 'Shopee', emoji: '🪙' },
  { title: 'Shopee 10.10 — Siêu Sale', category: 'Mua sắm', discount: 'Giảm đến 50% + Freeship', url: 'https://shopee.vn/m/shopee-sale', source: 'Shopee', emoji: '🛍️', badge: 'HOT' },
  { title: 'Shopee Food hôm nay', category: 'Ăn uống', discount: 'Freeship + giảm 15k-30k', url: 'https://shopee.vn/food', source: 'Shopee Food', emoji: '🍜' },
  { title: 'Điện thoại & máy tính bảng sale', category: 'Điện tử', discount: 'Giảm đến 40% thương hiệu lớn', url: 'https://shopee.vn/phones-tablets', source: 'Shopee', emoji: '📱' },
  { title: 'Thời trang nữ giảm mạnh', category: 'Thời trang', discount: 'Giảm 20-60% hàng nghìn mẫu', url: 'https://shopee.vn/fashion-women', source: 'Shopee', emoji: '👗' },
  { title: 'Shopee Sức khoẻ & Làm đẹp', category: 'Làm đẹp', discount: 'Mua 2 tặng 1 + giảm 25%', url: 'https://shopee.vn/health-beauty', source: 'Shopee', emoji: '💄' },
  // Lazada
  { title: 'Lazada Flash Sale hằng ngày', category: 'Mua sắm', discount: 'Giảm đến 80% sản phẩm chọn lọc', url: 'https://www.lazada.vn/campaigns/flash-sale/', source: 'Lazada', emoji: '🔥', badge: 'HOT' },
  { title: 'Lazada Ngày siêu sale', category: 'Mua sắm', discount: 'Freeship + giảm thêm 20%', url: 'https://www.lazada.vn/campaigns/best-price/', source: 'Lazada', emoji: '💸' },
  { title: 'Điện gia dụng Lazada', category: 'Gia dụng', discount: 'Trả góp 0% + giảm đến 35%', url: 'https://www.lazada.vn/catalog/?q=household-appliances', source: 'Lazada', emoji: '🏠' },
  // Tiki
  { title: 'TikiNOW giao siêu tốc 2h', category: 'Mua sắm', discount: 'Freeship + giảm thêm 15%', url: 'https://tiki.vn/khuyen-mai/tiki-ngon', source: 'Tiki', emoji: '⚡' },
  { title: 'Sách & văn phòng phẩm Tiki', category: 'Sách', discount: 'Giảm 10-40% + tặng bookmark', url: 'https://tiki.vn/nha-sach-tiki/c8322', source: 'Tiki', emoji: '📚' },
  { title: 'Tiki Trading deals hot', category: 'Điện tử', discount: 'Chính hãng + bảo hành 12 tháng', url: 'https://tiki.vn/khuyen-mai/flash-sale', source: 'Tiki', emoji: '🛒', badge: 'MỚI' },
  // Travel
  { title: 'Agoda giảm đến 40% khách sạn', category: 'Du lịch', discount: 'Đặt sớm giảm thêm 10%', url: 'https://www.agoda.com/vi-vn/deals', source: 'Agoda', emoji: '🏨' },
  { title: 'Traveloka vé máy bay rẻ nhất', category: 'Du lịch', discount: 'Vé nội địa từ 99k', url: 'https://www.traveloka.com/vi-vn/flight/promo', source: 'Traveloka', emoji: '✈️', badge: 'HOT' },
  { title: 'VinPearl & resort ưu đãi hè', category: 'Du lịch', discount: 'Combo nghỉ dưỡng tiết kiệm 30%', url: 'https://vinpearl.com/vi/khuyen-mai', source: 'VinPearl', emoji: '🌴' },
  // Food & Delivery
  { title: 'GrabFood giảm 30k mỗi ngày', category: 'Ăn uống', discount: 'Nhập code GRAB30 giảm ngay', url: 'https://food.grab.com/vn/vi/', source: 'GrabFood', emoji: '🍔' },
  { title: 'ShopeeFood freeship + giảm 25k', category: 'Ăn uống', discount: 'Đơn từ 50k áp dụng', url: 'https://shopee.vn/food', source: 'Shopee Food', emoji: '🍱' },
  { title: 'Baemin voucher hàng ngày', category: 'Ăn uống', discount: 'Hoàn tiền 20% tối đa 30k', url: 'https://www.baemin.com/vi', source: 'Baemin', emoji: '🛵' },
  // Tech
  { title: 'CellphoneS iPhone & Android sale', category: 'Điện tử', discount: 'Thu cũ đổi mới + trả góp 0%', url: 'https://cellphones.com.vn/khuyen-mai.html', source: 'CellphoneS', emoji: '📲', badge: 'HOT' },
  { title: 'FPT Shop ưu đãi laptop', category: 'Điện tử', discount: 'Tặng túi chống sốc + giảm đến 3tr', url: 'https://fptshop.com.vn/khuyen-mai', source: 'FPT Shop', emoji: '💻' },
  { title: 'Thế Giới Di Động deals hot', category: 'Điện tử', discount: 'Giảm giá sốc khi đặt online', url: 'https://www.thegioididong.com/tin-tuc/khuyen-mai', source: 'TGDĐ', emoji: '📡' },
  // Grocery / Lifestyle
  { title: 'WinMart+ giao hàng siêu nhanh', category: 'Siêu thị', discount: 'Mua 2 giảm 5k, mua 3 giảm 12k', url: 'https://winmart.vn/khuyen-mai', source: 'WinMart', emoji: '🛒' },
  { title: 'Bach Hoa Xanh tươi sạch giảm giá', category: 'Siêu thị', discount: 'Hàng tươi giảm 15% mỗi sáng', url: 'https://www.bachhoaxanh.com/khuyen-mai', source: 'BHX', emoji: '🥬' },
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
