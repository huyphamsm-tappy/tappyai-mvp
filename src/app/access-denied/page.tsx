import type { Metadata } from 'next'
import { parseDenial } from '@/lib/admin/denial'
import { DeniedView } from './DeniedView'

// Controller V2 — B5, Denial UX (01_ARCH §8).
//
// This page lives OUTSIDE /admin on purpose. Every page under /admin carries
// its own guard, so a denial that redirected into the Controller would re-run
// the failing check forever — the loop `guards.test.ts` pins as a regression.
//
// It resolves NOTHING about the visitor: no session read, no actor resolution,
// no database. It cannot, because the visitor arriving here is by definition one
// the guards refused, and re-running the refusal to describe it would be the
// loop again in miniature. It renders a message from a validated reason code and
// nothing else.

export const metadata: Metadata = {
  title: 'Access denied — TappyAI',
  // A refusal page has no business in search results.
  robots: { index: false, follow: false },
}

export default function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const denial = parseDenial(searchParams)

  return (
    <DeniedView
      reason={denial.reason}
      permission={
        denial.permission && {
          displayName: denial.permission.displayName,
          description: denial.permission.description,
          roles: denial.permission.defaultRoles,
        }
      }
      // Offered ONLY for a permission denial. That is the one reason that
      // implies the visitor was admitted to the Controller and merely lacked a
      // screen. For every other reason the Controller is closed to them, and
      // linking there would be a second dead end.
      //
      // Derived from the reason rather than from the session on purpose: it is
      // a link, not an authorization, and /admin re-checks everything anyway.
      canReturnToController={denial.reason === 'missing_permission'}
    />
  )
}
