'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Loader2, Users } from 'lucide-react'

export default function GroupNewForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Không thể tạo nhóm')
        return
      }
      const data = await res.json()
      router.push(`/group/${data.id}`)
    } catch {
      setError('Lỗi kết nối, vui lòng thử lại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header showBack title="Tạo nhóm mới" />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center shrink-0">
              <Users className="text-white" size={22} />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white text-lg">Đi đâu ăn gì cả team?</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Tạo nhóm, chia sẻ link, để Tappy gợi ý</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Tên nhóm của bạn
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="VD: Team Marketing, Hội bạn thân, Cả nhà..."
                maxLength={80}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-95"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : '🍽️'}
              {loading ? 'Đang tạo...' : 'Tạo nhóm'}
            </button>
          </form>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
