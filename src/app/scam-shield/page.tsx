'use client'

import { Suspense } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import ScamShieldView from './ScamShieldView'

export default function ScamShieldPage() {
  return (
    <div className="flex flex-col h-dvh bg-white dark:bg-gray-950">
      <Header />
      <Suspense>
        <ScamShieldView />
      </Suspense>
      <BottomNav />
    </div>
  )
}
