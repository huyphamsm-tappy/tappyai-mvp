'use client'

import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { DisplayReason } from '@/lib/admin/denial'

// Controller V2 — B5, Denial UX (01_ARCH §8). Presentation only.
//
// Everything this renders was decided on the server: the reason was chosen by
// the guard that refused the request, and the permission was resolved against
// the registry there. This component cannot admit anyone and makes no
// authorization decision — it receives strings and shows them.

export interface DeniedViewProps {
  reason: DisplayReason
  /** Present only for a permission denial, already validated against the registry. */
  permission?: { displayName: string; description: string; roles: readonly string[] }
  /** True when the visitor holds some Controller role, so "back" can go there. */
  canReturnToController: boolean
}

export function DeniedView({ reason, permission, canReturnToController }: DeniedViewProps) {
  const { t } = useTranslation()

  return (
    <main className="admin-theme min-h-dvh bg-background text-foreground flex items-center justify-center p-6">
      {/* role="alert" so a screen reader announces the refusal rather than
          leaving the visitor on a page that merely looks wrong. */}
      <div role="alert" className="w-full max-w-lg rounded-admin-md border border-border bg-card p-8">
        <div className="flex items-center gap-3">
          {/* Decorative: the heading beside it carries the meaning, so the icon
              is hidden from assistive tech rather than announced twice. §8 of
              the UI standards: never colour/icon alone. */}
          <ShieldAlert aria-hidden="true" className="h-6 w-6 text-destructive shrink-0" />
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t('admin.denied.heading')}
          </p>
        </div>

        <h1 className="mt-4 text-xl font-bold">{t(`admin.denied.${reason}.title`)}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t(`admin.denied.${reason}.body`)}
        </p>

        {permission && (
          <div className="mt-5 rounded-admin-md border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">{permission.displayName}</p>
            <p className="mt-1 text-sm text-muted-foreground">{permission.description}</p>
            {permission.roles.length > 0 && (
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">{t('admin.denied.whoCanAccess')} </span>
                <span className="font-medium">{permission.roles.join(', ')}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {/* "A dead end is a support ticket" — there is always a way onward.
              The Controller link is offered only to someone who can actually
              open it; otherwise it would be a second dead end. */}
          {canReturnToController && (
            <Link
              href="/admin"
              className="rounded-admin-md bg-interactive px-4 py-2 text-sm text-white transition-colors hover:opacity-90"
            >
              {t('admin.denied.backToController')}
            </Link>
          )}
          <Link
            href="/reviews"
            className="rounded-admin-md border border-border px-4 py-2 text-sm transition-colors hover:bg-muted"
          >
            {t('admin.denied.backToSite')}
          </Link>
        </div>
      </div>
    </main>
  )
}
