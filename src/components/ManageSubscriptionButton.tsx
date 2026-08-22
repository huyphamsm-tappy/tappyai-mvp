'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import { useState } from 'react'
import { Settings, Loader2 } from 'lucide-react'

// Opens the Stripe Customer Portal so a Pro member can manage or cancel their
// subscription (MFS 6.3 Membership: "easy to leave"). Mirrors StripeCheckoutButton.
export default function ManageSubscriptionButton() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleManage = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
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
    <div className="mt-3">
      <button
        onClick={handleManage}
        disabled={loading}
        aria-label={t('sub.manage.label')}
        className="w-full py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 active:scale-95 transition-all disabled:opacity-70"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Settings size={15} />}
        {loading ? t('sub.manage.opening') : t('sub.manage')}
      </button>
      {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
    </div>
  )
}
