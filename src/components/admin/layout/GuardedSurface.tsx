'use client'

import type { ReactNode } from 'react'
import { useControllerOrigin } from './originGate'
import { useTranslation } from '@/lib/i18n/useTranslation'

/**
 * Wraps a Controller surface whose data comes from an `/api/admin/*` route that
 * carries the same-origin guard.
 *
 * 🚨 WHY READS NEED THIS AND NOT JUST WRITES. Seven of the 25 `isSameOrigin`
 * call sites are `GET`, and six of them are fetched from client components —
 * analytics (users, activation, auth), the moderation queue, the membership
 * roster and user notes. On a non-canonical origin those reads are refused too.
 * Without this the panel would sit on a spinner, or show "no data", and the
 * person would conclude the platform is empty rather than that they are on the
 * wrong hostname.
 *
 * It renders a plain statement instead of the surface, and it renders NOTHING
 * different on the canonical origin — see the tests: the enabled path is
 * asserted, not just the disabled one, because a gate that is always closed
 * would pass every "is it disabled?" test ever written.
 */
export function GuardedSurface({ children }: { children: ReactNode }) {
  const { installed, guardedApiAvailable, showUnavailableNotice } = useControllerOrigin()
  const { t } = useTranslation()

  // Not yet observed (server render, first paint): render the surface as usual.
  // The request it makes is what fails, and the banner will appear a tick later.
  // Blanking the panel here would flash on the canonical origin, where nothing
  // is wrong.
  if (!installed || guardedApiAvailable || !showUnavailableNotice) return <>{children}</>

  return (
    <p data-testid="controller-surface-unavailable" className="text-muted-foreground text-sm">
      {t('admin.origin.dataUnavailable')}
    </p>
  )
}

/**
 * Props for a control that performs a guarded mutation.
 *
 * 🚨 NOT authorization. `isSameOrigin(req)` refuses the request regardless; this
 * only stops the Controller from presenting an action it knows the server will
 * reject, which is the whole defect. Consumers spread it onto the control so
 * there is one implementation of "is this actionable here", not twenty.
 */
export function useGuardedActionProps(): { disabled: boolean; title: string | undefined } {
  const { installed, guardedApiAvailable } = useControllerOrigin()
  const { t } = useTranslation()
  const ok = !installed || guardedApiAvailable
  return {
    disabled: !ok,
    title: ok ? undefined : t('admin.origin.actionUnavailable'),
  }
}
