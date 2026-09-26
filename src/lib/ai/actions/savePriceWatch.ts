import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { pw, type PwLang } from '@/lib/priceWatch/messages'
import type { ActionPolicy } from './runAction'

// ── P0-2: the first AI write action to go through the boundary ───────────────
//
// This file is the POLICY; runAction.ts is the boundary. The split is the point: the checks below
// are specific to price watches, and the ordering (permission → validate → scope → execute →
// audit) is not — it is the same for every write that follows.
//
// BEHAVIOUR IS DELIBERATELY UNCHANGED. Same limit, same messages, same returned object, same
// table. The tool's schema and its result shape are untouched, so the model, all three clients and
// the existing price-watch tests see exactly what they saw before. What changed is that the checks
// now live somewhere a second write action can reuse, and that both outcomes are audited.

/** The maximum number of active watches one user may hold. Was inline in the route. */
export const MAX_ACTIVE_WATCHES = 10

export interface SavePriceWatchArgs {
  productName: string
  targetPriceVnd: number
  searchQuery: string
}

export interface SavePriceWatchResult {
  ok: true
  id: string
  product_name: string
  target_price: number
  message: string
}

/** Bounds on model-supplied text. The zod schema types these; nothing bounded their SIZE. */
const MAX_PRODUCT_NAME = 200
const MAX_SEARCH_QUERY = 300

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * @param lang     the language of THIS message, as the route already detected it
 * @param client   injectable for tests; production passes nothing and gets the admin client
 */
export function savePriceWatchPolicy(
  lang: PwLang,
  client?: () => SupabaseClient,
): ActionPolicy<SavePriceWatchArgs, SavePriceWatchResult> {
  const db = () => (client ? client() : createAdminClient())

  return {
    unauthenticatedMessage: pw.needLogin(lang),
    failureMessage: pw.saveError(lang),

    /**
     * The only interpretation of model-supplied data in the whole path.
     *
     * The zod schema on the tool already guarantees TYPES. It does not guarantee meaning: a model
     * that has been talked into it can send an empty name, a negative price, a price of
     * `Number.MAX_SAFE_INTEGER`, or a 50KB string — all of which are valid `string`/`number`.
     */
    validate: (raw) => {
      const r = (raw ?? {}) as Record<string, unknown>
      const productName = str(r.product_name)
      const searchQuery = str(r.search_query)
      const price = typeof r.target_price === 'number' ? r.target_price : NaN

      if (!productName || !searchQuery) {
        return { ok: false, reason: 'invalid_arguments', message: pw.saveError(lang) }
      }
      if (productName.length > MAX_PRODUCT_NAME || searchQuery.length > MAX_SEARCH_QUERY) {
        return { ok: false, reason: 'invalid_arguments', message: pw.saveError(lang) }
      }
      // Finite and positive. `Number.isFinite` rejects NaN and both infinities; a non-positive
      // target would arm an alert that can never fire.
      if (!Number.isFinite(price) || price <= 0) {
        return { ok: false, reason: 'invalid_arguments', message: pw.saveError(lang) }
      }
      return {
        ok: true,
        args: { productName, targetPriceVnd: Math.round(price), searchQuery },
      }
    },

    /**
     * Per-user cap, counted from the ACTOR'S OWN rows.
     *
     * Unchanged in value and effect; it simply runs before the insert rather than beside it, so
     * every write action gets its limit checked in the same place.
     */
    scope: async ({ userId }) => {
      const { count } = await db()
        .from('price_watches')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'active')
      if ((count ?? 0) >= MAX_ACTIVE_WATCHES) {
        return { ok: false, reason: 'scope_exceeded', message: pw.limitReached(lang) }
      }
      return { ok: true }
    },

    /**
     * The deterministic side effect.
     *
     * `user_id` is written from the ACTOR the boundary resolved, never from the arguments — the
     * model has no way to name an owner. The admin client is still used (a Bearer-authenticated
     * native request has no cookie session for RLS to read), which is exactly why ownership has to
     * be pinned here rather than delegated.
     */
    execute: async ({ userId, args }) => {
      const { data, error } = await db()
        .from('price_watches')
        .insert({
          user_id: userId,
          product_name: args.productName,
          target_price: args.targetPriceVnd,
          search_query: args.searchQuery,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.code ?? error.message)
      return {
        ok: true,
        id: data.id,
        product_name: args.productName,
        target_price: args.targetPriceVnd,
        message: pw.saved(lang, args.productName, args.targetPriceVnd),
      }
    },

    target: ({ result }) => ({ type: 'price_watch', id: result.id }),

    /** Operational facts only — no user message, no model prose. Admins read this column. */
    summary: ({ args }) => ({ targetPriceVnd: args.targetPriceVnd }),
  }
}
