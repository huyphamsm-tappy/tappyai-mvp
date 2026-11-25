'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

interface Props {
  serviceName: string
  date: string
  time?: string | null
  customerName: string
  phone: string
  guests: number
  notes?: string | null
}

export function BookingShareButton({ serviceName, date, time, customerName, phone, guests, notes }: Props) {
  const { t } = useTranslation()
  const [shared, setShared] = useState(false)

  const handleShare = async () => {
    const lines = [
      `📋 ${t('bookings.confirmTitle')}`,
      `🏠 ${serviceName}`,
      `📅 ${t('bookings.dateLabel')}: ${date}${time ? ` ${t('bookings.atTime', { time })}` : ''}`,
      `👤 ${customerName} | 📞 ${phone}`,
      guests > 1 ? `👥 ${t('bookings.guestsLabel')}: ${guests}` : '',
      notes ? `📝 ${notes}` : '',
    ].filter(Boolean).join('\n')

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: t('bookings.confirmTitle'), text: lines })
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      } catch { /* user cancelled */ }
    } else {
      window.location.href = `mailto:?subject=${encodeURIComponent(t('bookings.confirmTitle'))}&body=${encodeURIComponent(lines)}`
    }
  }

  return (
    <button
      onClick={handleShare}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
        shared
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600'
      }`}
    >
      {shared ? <Check size={13} /> : <Share2 size={13} />}
      {shared ? t('bookings.shared') : t('bookings.shareAgain')}
    </button>
  )
}
