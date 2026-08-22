'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import { useState } from 'react'
import { Zap, Loader2 } from 'lucide-react'

export default function StripeCheckoutButton() {
  const { t } = useTranslation()
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
        setError(data.message || t('sub.checkout.error'))
        setLoading(false)
      }
    } catch {
      setError(t('sub.checkout.offline'))
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-white text-primary-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/90 active:scale-95 transition-all disabled:opacity-70"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Zap size={16} />
        )}
        {loading ? t('sub.checkout.redirecting') : t('sub.checkout.upgrade')}
      </button>
      {error && <p className="text-red-300 text-xs mt-2 text-center">{error}</p>}
    </div>
  )
}
