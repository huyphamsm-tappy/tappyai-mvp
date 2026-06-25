'use client'

import { useRouter } from 'next/navigation'
import { CATEGORIES, cn } from '@/lib/utils'

export default function CategoryGrid({ onSelect }: { onSelect?: (id: string) => void }) {
  const router = useRouter()
  const handleClick = (id: string) => {
    if (onSelect) { onSelect(id) } else { router.push(`/chat?category=${id}`) }
  }
  return (
    <div className="grid grid-cols-5 gap-2">
      {CATEGORIES.map((cat) => (
        <button key={cat.id} onClick={() => handleClick(cat.id)} className={cn('flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-150 active:scale-95', cat.color)}>
          <span className="text-2xl">{cat.emoji}</span>
          <span className="text-xs font-medium leading-tight text-center">{cat.label}</span>
        </button>
      ))}
    </div>
  )
}
