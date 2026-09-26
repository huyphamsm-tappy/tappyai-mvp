'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Lets the user erase a chat conversation from their history (MFS 6.5: erasable).
export default function DeleteConversationButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { t } = useTranslation()

  const handleDelete = async () => {
    if (!window.confirm(t('history.deleteConfirm'))) return
    setLoading(true)
    try {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
      else setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      aria-label={t('history.delete')}
      // 40×40 so the target meets the touch floor beside a 56px row; the 32px box it had
      // sat under a thumb.
      className="flex h-10 w-10 -mr-1 items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
    </button>
  )
}
