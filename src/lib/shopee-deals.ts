export interface Deal {
  title: string
  category: string
  discount: string
  url: string
  source: string
}

const FALLBACK_DEALS: Deal[] = [
  { title: 'Flash Sale Shopee 0h', category: 'Điện tử', discount: 'Giảm đến 50%', url: 'https://shopee.vn/flash_sale', source: 'Shopee' },
  { title: 'Voucher Shopee hôm nay', category: 'Mua sắm', discount: 'Giảm 30k đơn 99k', url: 'https://shopee.vn/voucher', source: 'Shopee' },
  { title: 'Shopee Food ưu đãi', category: 'Ăn uống', discount: 'Freeship + giảm 15k', url: 'https://food.shopee.vn', source: 'Shopee Food' },
  { title: 'Agoda deals hôm nay', category: 'Du lịch', discount: 'Giảm đến 40% khách sạn', url: 'https://www.agoda.com/vi-vn/deals', source: 'Agoda' },
  { title: 'Lazada Flash Sale', category: 'Mua sắm', discount: 'Giảm đến 70%', url: 'https://www.lazada.vn/campaigns/best-price/', source: 'Lazada' },
  { title: 'Freeship toàn quốc Shopee', category: 'Vận chuyển', discount: 'Freeship đơn từ 0đ', url: 'https://shopee.vn/m/freeship', source: 'Shopee' },
  { title: 'Shopee Xu đổi ưu đãi', category: 'Tiết kiệm', discount: 'Đổi Xu giảm thêm tiền', url: 'https://shopee.vn/coin', source: 'Shopee' },
]

export async function getShopeeDeals(): Promise<Deal[]> {
  try {
    const res = await fetch('https://shopee.vn/api/v4/flash_sale/get_all_sessions', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TappyAI/1.0)' },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      // If Shopee API is reachable, still return curated deals for now.
      // Replace with real parsing once Affiliate API credentials are available.
      return FALLBACK_DEALS
    }
  } catch {
    // Network error or timeout — use fallback
  }
  return FALLBACK_DEALS
}
