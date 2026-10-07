'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'

interface Props {
  placeId: string
  onDeleted: () => void
}

export function FavoriteDeleteButton({ placeId, onDeleted }: Props) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/favorites?placeId=${encodeURIComponent(placeId)}`, { method: 'DELETE' })
      if (res.ok) onDeleted()
    } catch { /* ignore */ }
    setLoading(false)
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="p-2 rounded-xl text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
      aria-label="Xóa khỏi yêu thích"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
    </button>
  )
}
