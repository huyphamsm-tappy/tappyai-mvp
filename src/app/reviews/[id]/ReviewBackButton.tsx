'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { goBack } from '@/lib/nav/inAppBack'

export default function ReviewBackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => {
        // Justified transport read (spec I1): picks a destination — back when the
        // previous entry is OURS, /reviews otherwise. Decides no business state; Explore
        // restoration is owned by ExploreSession and works on either landing.
        // (`history.length > 1` was the earlier test; a fresh tab's blank entry makes it
        // true for a shared link and Back then left the site — see lib/nav/inAppBack.)
        goBack(router, '/reviews')
      }}
      className="absolute top-12 left-4 z-20 w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      aria-label="Quay lại"
    >
      <ArrowLeft size={20} className="text-white" />
    </button>
  )
}
