'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function ReviewBackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => {
        if (window.history.length > 1) router.back()
        else router.push('/reviews')
      }}
      className="absolute top-12 left-4 z-20 w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      aria-label="Quay lại"
    >
      <ArrowLeft size={20} className="text-white" />
    </button>
  )
}
