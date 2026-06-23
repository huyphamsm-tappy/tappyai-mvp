'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeftRight, RefreshCw, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

const CURRENCIES = [
  { code: 'VND', name: 'Việt Nam Đồng', flag: '🇻🇳', decimals: 0 },
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸', decimals: 2 },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺', decimals: 2 },
  { code: 'JPY', name: 'Nhật Yên', flag: '🇯🇵', decimals: 0 },
  { code: 'KRW', name: 'Won Hàn Quốc', flag: '🇰🇷', decimals: 0 },
  { code: 'GBP', name: 'Bảng Anh', flag: '🇬🇧', decimals: 2 },
  { code: 'AUD', name: 'Đô Úc', flag: '🇦🇺', decimals: 2 },
  { code: 'SGD', name: 'Đô Singapore', flag: '🇸🇬', decimals: 2 },
  { code: 'THB', name: 'Baht Thái', flag: '🇹🇭', decimals: 2 },
  { code: 'CNY', name: 'Nhân dân tệ', flag: '🇨🇳', decimals: 2 },
  { code: 'HKD', name: 'Đô Hồng Kông', flag: '🇭🇰', decimals: 2 },
  { code: 'TWD', name: 'Đô Đài Loan', flag: '🇹🇼', decimals: 0 },
]

function formatAmount(val: number, decimals: number) {
  if (!isFinite(val)) return '—'
  return val.toLocaleString('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function CurrencySelect({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  const cur = CURRENCIES.find(c => c.code === value)
  return (
    <div className="flex-1">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">{label}</p>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 pr-8 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40"
        >
          {CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">▾</div>
      </div>
      {cur && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 pl-1">{cur.flag} {cur.name}</p>
      )}
    </div>
  )
}

export default function CurrencyPage() {
  const [rates, setRates] = useState<Record<string, number> | null>(null)
  const [rateDate, setRateDate] = useState<string | null>(null)
  const [fallback, setFallback] = useState(false)
  const [loadingRates, setLoadingRates] = useState(true)

  const [amount, setAmount] = useState('1000000')
  const [from, setFrom] = useState('VND')
  const [to, setTo] = useState('USD')

  useEffect(() => {
    fetch('/api/rates')
      .then(r => r.json())
      .then(d => {
        setRates(d.rates)
        setRateDate(d.date)
        setFallback(d.fallback)
      })
      .catch(() => setFallback(true))
      .finally(() => setLoadingRates(false))
  }, [])

  const swap = useCallback(() => {
    setFrom(to)
    setTo(from)
  }, [from, to])

  const fromCur = CURRENCIES.find(c => c.code === from)!
  const toCur = CURRENCIES.find(c => c.code === to)!

  const numAmount = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0

  let converted: number | null = null
  let rate: number | null = null
  if (rates && numAmount > 0) {
    const fromUSD = from === 'USD' ? 1 : (rates['USD'] / (rates[from] || 1))
    const toRate = to === 'USD' ? 1 : (rates[to] / rates['USD'])
    rate = (1 / (rates[from] || 1)) * (rates[to] || 1)
    if (from === 'USD') rate = rates[to] || 1
    else if (to === 'USD') rate = 1 / (rates[from] || 1)
    else rate = (rates[to] || 1) / (rates[from] || 1)
    converted = numAmount * rate
    void fromUSD; void toRate
  }

  const formattedDate = rateDate
    ? new Date(rateDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3">
        <Link href="/" className="p-1.5 -ml-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
        </Link>
        <h1 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
          💱 Đổi tiền tệ
        </h1>
      </div>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Amount input */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Số tiền</p>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Nhập số tiền..."
            className="w-full text-3xl font-black text-gray-900 dark:text-white bg-transparent border-none outline-none placeholder-gray-300 dark:placeholder-gray-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {['100000', '500000', '1000000', '5000000'].map(v => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors ${amount === v ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
              >
                {parseInt(v).toLocaleString('vi-VN')}
              </button>
            ))}
          </div>
        </div>

        {/* Currency selectors + swap */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-end gap-3">
            <CurrencySelect value={from} onChange={setFrom} label="Từ" />
            <button
              onClick={swap}
              className="mb-1 p-2.5 rounded-2xl bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors flex-shrink-0"
              aria-label="Đổi chiều"
            >
              <ArrowLeftRight size={18} />
            </button>
            <CurrencySelect value={to} onChange={setTo} label="Sang" />
          </div>
        </div>

        {/* Result */}
        <div className="bg-gradient-to-br from-primary-500 to-accent-500 rounded-3xl p-6 shadow-lg shadow-primary-500/20 text-white">
          {loadingRates ? (
            <div className="flex items-center gap-2 animate-pulse">
              <RefreshCw size={16} className="animate-spin opacity-60" />
              <span className="text-white/70 text-sm">Đang tải tỷ giá...</span>
            </div>
          ) : converted !== null ? (
            <>
              <p className="text-white/70 text-sm mb-1">
                {formatAmount(numAmount, fromCur.decimals)} {from} =
              </p>
              <p className="text-4xl font-black leading-tight break-all">
                {formatAmount(converted, toCur.decimals)}
              </p>
              <p className="text-white/80 text-lg font-semibold mt-0.5">{toCur.flag} {to}</p>

              {rate !== null && (
                <div className="mt-4 pt-4 border-t border-white/20 text-xs text-white/60 space-y-0.5">
                  <p>1 {from} = {formatAmount(rate, toCur.decimals > 0 ? 4 : 2)} {to}</p>
                  <p>1 {to} = {formatAmount(1 / rate, fromCur.decimals > 0 ? 4 : 2)} {from}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-white/70 text-sm">Nhập số tiền để xem kết quả</p>
          )}
        </div>

        {/* Rate info */}
        <div className="text-center text-xs text-gray-400 dark:text-gray-500 space-y-1">
          {fallback ? (
            <p>⚠️ Đang dùng tỷ giá ước tính (không kết nối được nguồn dữ liệu)</p>
          ) : formattedDate ? (
            <p className="flex items-center justify-center gap-1.5">
              <RefreshCw size={10} />
              Tỷ giá cập nhật {formattedDate} · Nguồn: open.er-api.com
            </p>
          ) : null}
          <p>Tỷ giá chỉ mang tính tham khảo, không dùng cho giao dịch tài chính.</p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
