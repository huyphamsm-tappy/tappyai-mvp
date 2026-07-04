'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Trash2, RefreshCw, TrendingDown, ShoppingBag } from 'lucide-react'
import Link from 'next/link'

type Watch = {
  id: string
  product_name: string
  target_price: number
  current_price: number | null
  status: 'active' | 'triggered' | 'cancelled'
  last_checked: string | null
  created_at: string
}

function fmtVND(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + ' triệu'
  return (n / 1000).toFixed(0) + 'k'
}

function fmtDate(s: string | null) {
  if (!s) return 'Chưa kiểm tra'
  const d = new Date(s)
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

export default function PriceWatchesPage() {
  const [watches, setWatches] = useState<Watch[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchWatches = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/price-watch')
      if (res.ok) {
        const data = await res.json()
        setWatches(data.watches ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWatches() }, [])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await fetch('/api/price-watch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setWatches(w => w.filter(x => x.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const active = watches.filter(w => w.status === 'active')
  const triggered = watches.filter(w => w.status === 'triggered')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            ←
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">🎯 Theo dõi giá</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Tappy báo bạn khi giá xuống mức mong muốn</p>
          </div>
          <button
            onClick={fetchWatches}
            disabled={loading}
            className="ml-auto p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw size={16} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* How to add */}
        <div className="card p-4 mb-5 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
          <p className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-1">💬 Cách thêm sản phẩm</p>
          <p className="text-xs text-primary-600 dark:text-primary-400 leading-relaxed">
            Nhắn Tappy: <span className="font-mono bg-white/60 dark:bg-black/20 px-1.5 py-0.5 rounded">&ldquo;Tappy theo dõi AirPods Pro, báo mình khi dưới 2 triệu&rdquo;</span>
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
          >
            <ShoppingBag size={12} />
            Nhắn Tappy ngay
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-gray-300" />
          </div>
        ) : watches.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-600">
            <TrendingDown size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">Chưa theo dõi sản phẩm nào</p>
            <p className="text-sm mt-1">Nhắn Tappy để thêm sản phẩm đầu tiên</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active watches */}
            {active.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Bell size={11} /> Đang theo dõi ({active.length}/10)
                </p>
                <div className="space-y-2">
                  {active.map(w => (
                    <div key={w.id} className="card p-4 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                        <TrendingDown size={16} className="text-primary-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{w.product_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Mục tiêu: <span className="font-semibold text-primary-600 dark:text-primary-400">{fmtVND(w.target_price)}</span>
                          {w.current_price && (
                            <span className="ml-2 text-gray-400">· Hiện tại: {fmtVND(w.current_price)}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          Kiểm tra lần cuối: {fmtDate(w.last_checked)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(w.id)}
                        disabled={deleting === w.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-40"
                        aria-label="Hủy theo dõi"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Triggered watches */}
            {triggered.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <BellOff size={11} /> Đã thông báo ({triggered.length})
                </p>
                <div className="space-y-2">
                  {triggered.map(w => (
                    <div key={w.id} className="card p-4 flex items-start gap-3 opacity-60">
                      <div className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-base">✅</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{w.product_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Đã xuống mức <span className="font-semibold text-green-600">{w.current_price ? fmtVND(w.current_price) : fmtVND(w.target_price)}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
