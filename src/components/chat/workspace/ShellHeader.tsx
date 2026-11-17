'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Menu } from 'lucide-react'
import '@/components/chat/v206.css'
import UserAvatar from '@/components/UserAvatar'
import { useNotifications } from '@/components/NotificationProvider'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { planBadgeLabel } from '@/lib/chat/v206Look'

// The first layout's header (NEXT_PUBLIC_SHELL_REF): a menu button that opens / closes the history panel, the logo with the REAL plan badge, a bell to the person's notifications (a red dot only
// when something is unread) and their real avatar to the profile. A guest has no profile to read: the avatar is then the app's initial-letter state. Nothing is drawn that has no source.
export default function ShellHeader({ historyOpen, onToggleHistory }: { historyOpen: boolean; onToggleHistory: () => void }) {
  const { t } = useTranslation()
  const { unreadCount } = useNotifications()
  const [badge, setBadge] = useState<string | null>(null)
  const [me, setMe] = useState<{ name: string; avatar: string } | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/payments/me', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (live) setBadge(planBadgeLabel(b?.subscription)) })
      .catch(() => {})
    fetch('/api/profile', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(p => { if (live && p) setMe({ name: typeof p.full_name === 'string' ? p.full_name : '', avatar: typeof p.avatar_url === 'string' ? p.avatar_url : '' }) })
      .catch(() => {})
    return () => { live = false }
  }, [])
  const unread = unreadCount > 0
  return (
    // the first layout: no bar behind the header: a row on the ground. Its left end is indented past the rail (96 / 104 px + the 12 px gap + 12 px), so the menu button and the logo sit over the history panel, not over the rail
    <header data-testid="v206-product-header" className="flex h-16 min-h-[64px] shrink-0 items-center justify-between pl-[120px] pr-4 2xl:pl-[128px]">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onToggleHistory} aria-label={t('chatWs.shell.menu')} aria-expanded={historyOpen}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-200 transition-colors hover:bg-white/10">
          <Menu size={22} aria-hidden="true" />
        </button>
        <Link href="/" aria-label={t('v206.product.home')} className="group flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own logo in /public/branding */}
          <img src="/branding/otter-logo.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[22%] object-cover transition-transform group-hover:scale-105" />
          <span className="text-xl font-bold tracking-tight text-white">TappyAI</span>
          {badge && <span data-testid="v206-plan-badge" className="rounded border border-white/15 bg-white/10 px-1.5 font-mono text-[10px] font-bold leading-4 text-amber-200">{badge}</span>}
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/profile/notifications" aria-label={unread ? t('chatWs.shell.bellUnread') : t('chatWs.shell.bell')} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-200 transition-colors hover:bg-white/10">
          <Bell size={22} aria-hidden="true" />
          {unread && <span data-testid="shell-bell-dot" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#091022]" />}
        </Link>
        <Link href="/profile" aria-label={t('chatWs.shell.account')} className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full">
          <UserAvatar src={me?.avatar || null} name={me?.name} size={40} rounded="rounded-full" />
        </Link>
      </div>
    </header>
  )
}
