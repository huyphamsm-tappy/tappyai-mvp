import { PLAN_CONFIG } from '@/lib/plans/planConfig'

// ── Non-renewing App Store products (the 7-day Pip pack) ─────────────────────────────────────────────────────
//
// Apple gives a non-renewing subscription NO expiresDate and NO subscription status (the status endpoint knows only
// auto-renewing groups). The end of the period is therefore ours to compute, from the verified transaction:
// purchase date plus the plan's own length. Never "now plus 7 days": a transaction replayed later (reopen the app,
// Restore) must land on the same end, so a replay can never add time.

/** Store product ids that are NOT auto-renewing. Derived from the plan table, so the pack's id lives in one place. */
export const NON_RENEWING_PRODUCT_IDS: readonly string[] = [PLAN_CONFIG.pip.storeProductId!]

export function isNonRenewingProduct(productId: string | null | undefined): boolean {
  return !!productId && NON_RENEWING_PRODUCT_IDS.includes(productId)
}

const DAY_MS = 86_400_000

/** The period a verified non-renewing transaction pays for. Throws on a transaction without a real purchase date or a plan without a length. Pure. */
export function nonRenewingPeriod(tx: { purchaseDate: number }, durationDays: number): { startsAt: Date; expiresAt: Date } {
  if (!Number.isFinite(tx.purchaseDate) || tx.purchaseDate <= 0) throw new Error('non_renewing_purchase_date_missing')
  if (!Number.isFinite(durationDays) || durationDays <= 0) throw new Error('non_renewing_duration_missing')
  return { startsAt: new Date(tx.purchaseDate), expiresAt: new Date(tx.purchaseDate + durationDays * DAY_MS) }
}
