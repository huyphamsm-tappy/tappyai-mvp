'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { performSignOut } from '@/lib/auth/signOut'
import { loginPathFor } from '@/lib/auth/returnTo'

// Controller sign-out.
//
// 🔑 WHY THIS HAD TO EXIST. The shell's only LogOut-shaped affordance was the
// "back to app" link — same icon, same corner — which navigates to `/reviews`
// WITH THE SESSION STILL LIVE. An admin who clicked it believing they had
// signed out had not, and the next person at that machine could walk back into
// `/admin`. Leaving the Controller and ending a session are different
// intentions; both now exist, and they are different controls.
//
// It adds no authentication mechanism: `performSignOut` is the single
// `auth.signOut()` call site the consumer app uses too.

export function ControllerSignOutButton() {
  const { t } = useTranslation()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const handleSignOut = async () => {
    if (busy) return
    setBusy(true)
    await performSignOut()
    // Back to the CONTROLLER sign-in, not the consumer one: `returnTo` is what
    // selects the corporate card and what returns them here afterwards. A bare
    // `/login` would drop an admin onto the Google/Zalo card.
    router.push(loginPathFor('/admin'))
    // Next caches server-rendered segments; without this the admin pages the
    // router already has could be shown again from cache after signing out.
    router.refresh()
  }

  return (
    <button
      type="button"
      data-testid="controller-sign-out"
      onClick={handleSignOut}
      disabled={busy}
      aria-busy={busy}
      className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">{t('admin.shell.signOut')}</span>
      <span className="sr-only sm:hidden">{t('admin.shell.signOut')}</span>
    </button>
  )
}
