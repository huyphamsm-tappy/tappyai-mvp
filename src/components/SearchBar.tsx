'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

export default function SearchBar({ placeholder, onSearch }: { placeholder?: string; onSearch?: (q: string) => void }) {
  const [query, setQuery] = useState('')
  const router = useRouter()
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    if (onSearch) { onSearch(query) } else { router.push(`/chat?q=${encodeURIComponent(query)}`) }
  }
  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder || 'Hỏi TappyAI về ăn uống, du lịch, spa...'} className="w-full bg-gray-100 dark:bg-gray-800 rounded-2xl pl-11 pr-4 py-3.5 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 text-[15px] transition-all" />
      {query && <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 bg-primary-500 text-white rounded-xl px-3 py-1.5 text-sm font-medium">Hỏi</button>}
    </form>
  )
}
