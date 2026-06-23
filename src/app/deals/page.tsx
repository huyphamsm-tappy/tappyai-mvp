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
}

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

export default async function DealsPage() {
  const deals = await getShopeeDeals()

  return (
    <main className="min-h-screen pb-24 pt-4 px-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Deal gần bạn hôm nay</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Ưu đãi tốt nhất được Tappy tuyển chọn</p>
        </div>
        <DealNotifyButton />
      </div>

      {/* Deal cards */}
      <div className="space-y-3">
        {deals.map((deal, i) => (
          <a
            key={i}
            href={deal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card flex items-center gap-4 p-4 hover:shadow-md transition-shadow group"
          >
            {/* Discount badge */}
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
              <span className="text-2xl">🛍️</span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{deal.title}</p>
                <ExternalLink size={14} className="flex-shrink-0 text-gray-400 group-hover:text-orange-500 transition-colors mt-0.5" />
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(deal.category)}`}>
                  {deal.category}
                </span>
                <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{deal.discount}</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">via {deal.source}</p>
            </div>
          </a>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">
        Deals được cập nhật mỗi ngày • Bật thông báo để nhận lúc 7:30 sáng
      </p>
    </main>
  )
}
