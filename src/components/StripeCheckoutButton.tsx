'use client'

import { useState } from 'react'
import { Zap, Loader2 } from 'lucide-react'

export default function StripeCheckoutButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCheckout = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.')
        setLoading(false)
      }
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-white text-primary-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/90 active:scale-95 transition-all disabled:opacity-70"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Zap size={16} />
        )}
        {loading ? 'Đang chuyển hướng...' : 'Nâng cấp Pro — 99K/tháng'}
      </button>
      {error && <p className="text-red-300 text-xs mt-2 text-center">{error}</p>}
    </div>
  )
}
