'use client'

import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Bell, BellOff, Loader2 } from 'lucide-react'

export default function DealNotifyButton() {
  const { permission, subscribed, loading, subscribe } = usePushNotifications()

  if (permission === 'unsupported') return null

  if (subscribed) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 text-sm font-medium">
        <Bell size={15} />
        Đã bật thông báo deal hàng ngày
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-sm">
        <BellOff size={15} />
        Thông báo bị chặn trong cài đặt trình duyệt
      </div>
    )
  }

  return (
    <button
      onClick={subscribe}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
      Nhận deal hàng ngày lúc 7:30
    </button>
  )
}
