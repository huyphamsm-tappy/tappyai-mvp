import type { MerchantContext } from '../authz'
import { newPublicId } from '../ids'
import { businessDb } from './client'

// Tappy Business — the merchant repository.
//
// ============================================================================
// WHY THIS DIRECTORY EXISTS
// ============================================================================
// Every Business table grants privileges to `service_role` alone, with RLS
// enabled and no policies. `service_role` bypasses RLS and holds full SELECT,
// so there is no database-side policy standing behind the application: a query
// that forgets its merchant filter returns another merchant's customers, and
// nothing downstream would notice.
//
// Until P0 that was prevented by convention — "call authz.ts first". Convention
// is exactly what this repository's guard culture exists to replace, so the
// boundary is mechanical: the architecture guard rule
// `no-business-tables-outside-data-layer` fences the nine Business table names
// to THIS DIRECTORY. A query written anywhere else in `src/` fails
// `npm run architecture:check`, in CI, before review.
//
// ============================================================================
// 🔑 THE CONVENTION EVERY REPOSITORY FUNCTION FOLLOWS
// ============================================================================
// A function that touches merchant-owned rows takes `MerchantContext` as its
// FIRST argument and derives the filter from it. The context can only be
// produced by `resolveMerchantContext()`, which reads the Controller session
// and nothing else, so a caller cannot reach the data without having proved who
// they are — and a reviewer sees the scope in the signature rather than hunting
// for an `.eq()` inside the body.
//
// `MerchantContext` is imported as a TYPE, so it is erased at compile time and
// no runtime cycle forms with authz.ts, which imports this module.
//
// ============================================================================
// THE TWO FUNCTIONS THAT ARE NOT CONTEXT-SCOPED, AND WHY
// ============================================================================
// `findMerchantByControllerUser` and `createMerchant` take a Controller user id
// because they are what CREATES the context — requiring one would be circular.
// Both filter on `controller_user_id`, and `resolveMerchantContext` re-checks
// the row it gets back before trusting it.
//
// No other function may take a bare identifier in place of a context.

/** The merchant columns authorization needs. Nothing else is selected. */
export interface MerchantRow {
  id: string
  public_id: string
  controller_user_id: string
  status: string
}

/** The full profile a merchant sees about themselves. Never sent to a customer. */
export interface MerchantProfileRow {
  public_id: string
  business_category: string
  shop_name: string
  address: string
  phone: string
  status: string
  legal_name: string | null
  tax_or_identity_number: string | null
  created_at: string
  updated_at: string
}

const PROFILE_COLUMNS =
  'public_id, business_category, shop_name, address, phone, status, legal_name, tax_or_identity_number, created_at, updated_at'

export interface CreateMerchantInput {
  businessCategory: string
  shopName: string
  address: string
  phone: string
  termsVersion: string
  acceptedIp: string | null
}

export interface UpdateMerchantInput {
  businessCategory?: string
  shopName?: string
  address?: string
  phone?: string
}

/**
 * The merchant owned by a Controller identity, or null when that identity has
 * not onboarded.
 *
 * `maybeSingle()` rather than `single()`: "this user is not a merchant" is an
 * ordinary answer on every route, not an error condition.
 */
export async function findMerchantByControllerUser(
  controllerUserId: string
): Promise<MerchantRow | null> {
  const { data, error } = await businessDb()
    .from('business_merchants')
    .select('id, public_id, controller_user_id, status')
    .eq('controller_user_id', controllerUserId)
    .maybeSingle()

  if (error) throw error
  return (data as MerchantRow | null) ?? null
}

/** The caller's own profile. Scoped by context, like everything else. */
export async function findMerchantProfile(
  ctx: MerchantContext
): Promise<MerchantProfileRow | null> {
  const { data, error } = await businessDb()
    .from('business_merchants')
    .select(PROFILE_COLUMNS)
    .eq('id', ctx.merchantId)
    .maybeSingle()

  if (error) throw error
  return (data as MerchantProfileRow | null) ?? null
}

/**
 * Onboard a Controller identity as a merchant, recording their acceptance of
 * the merchant terms.
 *
 * The two writes are NOT one transaction. Supabase's REST interface has no
 * transaction across statements, and introducing an RPC to get one would put
 * business logic into a SECURITY DEFINER function — a bigger change than the
 * problem justifies at P1. The ordering is chosen so the failure mode is
 * recoverable rather than silent: the merchant row is written first, so a
 * failure between the two leaves a merchant with no acceptance record, which
 * onboarding detects and completes on the next call. The reverse order would
 * leave an acceptance pointing at no merchant, which nothing would ever fix.
 *
 * `legal_name` and `tax_or_identity_number` are deliberately not written: they
 * stay NULL through MVP because this codebase has no encryption capability
 * (PHASE_0 §F3), and collecting an identity number without one is the wrong
 * order of operations.
 */
export async function createMerchant(
  controllerUserId: string,
  input: CreateMerchantInput
): Promise<MerchantRow> {
  const db = businessDb()

  const { data, error } = await db
    .from('business_merchants')
    .insert({
      public_id: newPublicId(),
      controller_user_id: controllerUserId,
      business_category: input.businessCategory,
      shop_name: input.shopName,
      address: input.address,
      phone: input.phone,
    })
    .select('id, public_id, controller_user_id, status')
    .single()

  if (error) throw error
  const merchant = data as MerchantRow

  await recordTermsAcceptance(merchant.id, input.termsVersion, input.acceptedIp)
  return merchant
}

/**
 * Append a terms acceptance.
 *
 * The table is append-only — `service_role` holds no UPDATE or DELETE on it —
 * and carries `UNIQUE (merchant_id, terms_version)`. Re-accepting the same
 * version is therefore a no-op rather than an error: `23505` means the record
 * this call wanted already exists, which is success by another name.
 */
export async function recordTermsAcceptance(
  merchantId: string,
  termsVersion: string,
  acceptedIp: string | null
): Promise<void> {
  const { error } = await businessDb()
    .from('business_merchant_terms_acceptances')
    .insert({ merchant_id: merchantId, terms_version: termsVersion, accepted_ip: acceptedIp })

  if (error && error.code !== '23505') throw error
}

/** Has this merchant accepted this exact terms version? */
export async function hasAcceptedTerms(
  ctx: MerchantContext,
  termsVersion: string
): Promise<boolean> {
  const { data, error } = await businessDb()
    .from('business_merchant_terms_acceptances')
    .select('id')
    .eq('merchant_id', ctx.merchantId)
    .eq('terms_version', termsVersion)
    .maybeSingle()

  if (error) throw error
  return data !== null
}

/**
 * Update the caller's own profile.
 *
 * `status` is absent from `UpdateMerchantInput` on purpose: suspension is a
 * moderation action carrying the `commerce.merchants.suspend` permission, and a
 * merchant must not be able to lift their own suspension by editing their shop
 * name. Nor are the legal fields writable here — see `createMerchant`.
 */
export async function updateMerchant(
  ctx: MerchantContext,
  patch: UpdateMerchantInput
): Promise<MerchantProfileRow | null> {
  const columns: Record<string, string> = {}
  if (patch.businessCategory !== undefined) columns.business_category = patch.businessCategory
  if (patch.shopName !== undefined) columns.shop_name = patch.shopName
  if (patch.address !== undefined) columns.address = patch.address
  if (patch.phone !== undefined) columns.phone = patch.phone

  if (Object.keys(columns).length === 0) return findMerchantProfile(ctx)

  const { data, error } = await businessDb()
    .from('business_merchants')
    .update(columns)
    .eq('id', ctx.merchantId)
    .select(PROFILE_COLUMNS)
    .maybeSingle()

  if (error) throw error
  return (data as MerchantProfileRow | null) ?? null
}
