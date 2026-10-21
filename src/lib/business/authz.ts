import { getRequestUser } from '@/lib/auth/getRequestUser'
import { findMerchantByControllerUser, type MerchantRow } from './repositories/merchants'

// Tappy Business — merchant authorization.
//
// Contract: docs/tappy-business/PHASE_0_ARCHITECTURE.md §F1, and §25 of the
// architecture contract.
//
// ============================================================================
// 🔑 THE ONE RULE
// ============================================================================
// A merchant's identity is derived from the AUTHENTICATED Controller session
// and from nothing else:
//
//     getRequestUser(req)  →  user.id
//         →  business_merchants.controller_user_id = user.id
//             →  merchant_id
//                 →  every query is scoped by that merchant_id
//
// 🚨 `merchant_id` MUST NEVER be read from a request body, query string or path
// parameter for the purpose of authorization. That is the whole of IDOR: a
// caller who can name the row they want is a caller who can read someone else's
// customers, phone numbers and delivery addresses. There is no endpoint in
// Tappy Business for which a client-supplied merchant id is the right input.
//
// ============================================================================
// WHY THIS IS NOT A SECOND RBAC SYSTEM
// ============================================================================
// §4 forbids Business from building a parallel identity, authentication or RBAC
// system, and this module builds none of them. Authentication is Controller's
// (`getRequestUser`). What happens here is ORDINARY RESOURCE OWNERSHIP — the
// same shape the product already uses for every user-owned row — not a
// role-and-permission model.
//
// The distinction matters in one specific way: the admin PDP
// (`src/lib/admin/permissions/`) exists for BACK-OFFICE OPERATORS. Granting a
// shop owner a `commerce.*` permission would place an ordinary end user inside
// the administrative permission model, which is a privilege boundary this
// product should never cross. The PDP governs the moderation surface — suspend
// a merchant, unpublish a product — and only that.
//
// ============================================================================
// WHAT STANDS BEHIND THIS MODULE, AND WHAT DOES NOT
// ============================================================================
// Stated plainly, because it decides where the risk sits. Every Business table
// grants privileges to `service_role` only, with RLS enabled and no policies,
// so no browser ever holds a connection and there is no RLS policy standing
// behind this code. For row-level scoping, THIS MODULE IS THE BOUNDARY, and
// that is why its isolation tests are proof rather than decoration.
//
// Two things do stand behind it, and neither depends on this file being called:
//
//   • `business_order_items` carries composite foreign keys into
//     (order_id, merchant_id) and (product_id, merchant_id), so an order item
//     that mixes two merchants is unrepresentable in the schema.
//
//   • The architecture guard rule `no-business-tables-outside-data-layer`
//     fences the nine Business table names to `src/lib/business/repositories/`.
//     A query written anywhere else fails CI, so "someone bypassed authz" is a
//     build failure rather than a silent leak.
//
// If a direct-read path for authenticated clients is ever introduced, RLS
// policies get added then — deliberately, with their own tests — rather than
// being carried unused until someone assumes they work.

/** Everything downstream code needs to scope a query. */
export interface MerchantContext {
  /** Internal UUID. Used for joins and filters; never sent to a client. */
  readonly merchantId: string
  /** The ULID that may appear in URLs and API responses. */
  readonly merchantPublicId: string
  /** The Controller identity that owns this merchant. */
  readonly controllerUserId: string
  readonly status: 'ACTIVE' | 'SUSPENDED'
}

export type MerchantAuthFailure =
  /** No valid Controller session on the request. */
  | 'UNAUTHENTICATED'
  /** Authenticated, but this identity has not onboarded as a merchant. */
  | 'NOT_A_MERCHANT'
  /** A merchant exists but is suspended by moderation. */
  | 'MERCHANT_SUSPENDED'

/**
 * The Controller user behind the request, carried out alongside the context.
 *
 * Business routes need it for one thing: `refuseAnonymousSocialWrite`. A
 * Supabase ANONYMOUS session is still a user, so "is authenticated" does not
 * mean "has an account" — and a shop belongs to a real account. Returning the
 * user here means a route can make that check without a second auth round-trip.
 */
export interface MerchantAuthUser {
  readonly id: string
  readonly is_anonymous?: boolean | null
}

export type MerchantAuthResult =
  | { readonly ok: true; readonly merchant: MerchantContext; readonly user: MerchantAuthUser }
  | { readonly ok: false; readonly reason: MerchantAuthFailure }

/** Raised when a row that was fetched does not belong to the acting merchant. */
export class MerchantIsolationError extends Error {
  constructor() {
    // Deliberately says nothing about which row, which merchant, or whether the
    // row exists. A caller who reaches this is either broken or probing.
    super('Resource does not belong to the authenticated merchant')
    this.name = 'MerchantIsolationError'
  }
}

/**
 * Seams for tests. Production never passes these — the defaults below are the
 * real Controller session and the real repository.
 */
export interface MerchantAuthDeps {
  getUser: (req: Request) => Promise<{ user: MerchantAuthUser | null }>
  loadMerchant: (controllerUserId: string) => Promise<MerchantRow | null>
}

const DEFAULT_DEPS: MerchantAuthDeps = {
  getUser: getRequestUser,
  loadMerchant: findMerchantByControllerUser,
}

/**
 * Resolve the merchant acting on this request.
 *
 * Returns a result rather than throwing so a route can map each failure onto
 * its own status and message through `apiError()`. A suspended merchant is
 * reported as such instead of being hidden behind `NOT_A_MERCHANT`, because the
 * caller genuinely is the owner and deserves to know why their shop stopped
 * working — the reason is theirs, not another user's.
 *
 * Note the signature: it takes a `Request` and returns an identity. There is no
 * parameter through which a caller could nominate a different merchant.
 */
export async function resolveMerchantContext(
  req: Request,
  deps: MerchantAuthDeps = DEFAULT_DEPS
): Promise<MerchantAuthResult> {
  const { user } = await deps.getUser(req)
  if (!user?.id) return { ok: false, reason: 'UNAUTHENTICATED' }

  const row = await deps.loadMerchant(user.id)
  if (!row) return { ok: false, reason: 'NOT_A_MERCHANT' }

  // Defence in depth against a future query losing its filter: the row that
  // came back must be the row that was asked for.
  if (row.controller_user_id !== user.id) return { ok: false, reason: 'NOT_A_MERCHANT' }

  const status = row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'
  const merchant: MerchantContext = {
    merchantId: row.id,
    merchantPublicId: row.public_id,
    controllerUserId: row.controller_user_id,
    status,
  }

  if (status === 'SUSPENDED') return { ok: false, reason: 'MERCHANT_SUSPENDED' }
  return { ok: true, merchant, user }
}

/**
 * The filter every merchant-scoped query must carry.
 *
 * Spread it into a Supabase `.match()` — `.match(merchantScope(ctx))` — so the
 * scoping is one token that is either present or obviously missing during
 * review, rather than an `.eq()` buried among other conditions that a later
 * edit can drop without anyone noticing.
 */
export function merchantScope(ctx: MerchantContext): { merchant_id: string } {
  return { merchant_id: ctx.merchantId }
}

/**
 * Verify a fetched row belongs to the acting merchant.
 *
 * Redundant when the query was correctly scoped — which is the point. It costs
 * one comparison and turns "the filter was dropped in a refactor" from a silent
 * data leak into a thrown error on the first request.
 */
export function assertMerchantOwnership(
  ctx: MerchantContext,
  row: { merchant_id?: string | null } | null | undefined
): void {
  if (!row || row.merchant_id !== ctx.merchantId) throw new MerchantIsolationError()
}
