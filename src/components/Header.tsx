'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Bell, ChevronLeft } from 'lucide-react'

interface HeaderProps {
  user?: { full_name?: string | null; avatar_url?: string | null; email?: string | null }
  showBack?: boolean
  backHref?: string
  title?: string
}

export default function Header({ user, showBack, backHref = '/', title }: HeaderProps) {
  const firstName = user?.full_name?.split(' ').pop() || user?.email?.split('@')[0] || 'bạn'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {showBack ? (<Link href={backHref} className="flex items-center gap-1 text-primary-500 font-medium text-sm -ml-1"><ChevronLeft size={20} />Quay lại</Link>) : (<Link href="/" className="flex items-center gap-2"><div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center"><span className="text-white font-bold text-sm">T</span></div><span className="font-bold text-gray-900 dark:text-white text-lg">TappyAI</span></Link>)}
        {title && <h1 className="font-semibold text-gray-900 dark:text-white truncate flex-1 text-center">{title}</h1>}
        {user && !showBack && (<div className="flex items-center gap-3"><span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">{greeting}, <span className="font-medium text-gray-900 dark:text-white">{firstName}</span></span><Link href="/profile">{user.avatar_url ? <Image src={user.avatar_url} alt={user.full_name || 'Avatar'} width={32} height={32} className="rounded-full ring-2 ring-primary-500/20" /> : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center"><span className="text-white text-sm font-semibold">{firstName[0]?.toUpperCase()}</span></div>}</Link></div>)}
      </div>
    </header>
  )
}
