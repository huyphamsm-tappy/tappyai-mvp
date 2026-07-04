import { getShopeeDeals } from '@/lib/shopee-deals'
import DealNotifyButton from './DealNotifyButton'
import { ExternalLink } from 'lucide-react'

const CATEGORY_COLORS: Record<string, string> = {
  'Điện tử': 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'Mua sắm': 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  'Ăn uống': 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
  'Du lịch': 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  'Vận chuyển': 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  'Tiết kiệm': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300',
  'Thời trang': 'bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300',
  'Làm đẹp': 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'Gia dụng': 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
  'Sách': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  'Siêu thị': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
}

const BADGE_STYLES: Record<string, string> = {
  'HOT': 'bg-red-500 text-white',
  'MỚI': 'bg-blue-500 text-white',
  'HẾT HÔM NAY': 'bg-orange-500 text-white',
}

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

function formatDate() {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date())
}

export default async function DealsPage() {
  const deals = await getShopeeDeals()

  return (
    <main className="min-h-screen pb-28 pt-4 px-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Deal hôm nay 🔥</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 capitalize">{formatDate()}</p>
          </div>
          <DealNotifyButton />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Tappy chọn lọc {deals.length} ưu đãi tốt nhất — cập nhật mỗi ngày lúc 7:30 sáng
        </p>
      </div>

      {/* Deal cards */}
      <div className="space-y-2.5">
        {deals.map((deal, i) => (
          <a
            key={i}
            href={deal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm hover:border-orange-200 dark:hover:border-orange-800 hover:shadow-md transition-all group active:scale-[0.99]"
          >
            {/* Emoji badge */}
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center text-2xl">
              {deal.emoji}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-1.5 mb-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug line-clamp-1 flex-1">
                  {deal.title}
                </p>
                {deal.badge && (
                  <span className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-md ${BADGE_STYLES[deal.badge] ?? 'bg-gray-200 text-gray-600'}`}>
                    {deal.badge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(deal.category)}`}>
                  {deal.category}
                </span>
                <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{deal.discount}</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">via {deal.source}</p>
            </div>

            {/* Arrow */}
            <ExternalLink
              size={14}
              className="flex-shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-orange-400 transition-colors"
            />
          </a>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-6 text-center space-y-1">
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Deals thay đổi mỗi ngày • Bật thông báo để nhận lúc 7:30 sáng
        </p>
        <p className="text-xs text-gray-300 dark:text-gray-700">
          Tappy không chịu trách nhiệm về giá và tình trạng sản phẩm trên nền tảng bên thứ ba
        </p>
      </div>
    </main>
  )
}
