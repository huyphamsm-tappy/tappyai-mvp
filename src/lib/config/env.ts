// Controller V2 — Component 9b: the typed configuration boundary.
//
// Closes audit finding D5 ("no central typed config module and no startup
// assertion") together with scripts/check-env.mjs.
//
// ── Division of labour, and why it is split this way ─────────────────────────
//   • scripts/check-env.mjs — DEPLOY-TIME gate over the five required
//     variables. Runs before `next build`, so a missing or malformed value
//     fails the deploy and the previous deployment keeps serving.
//   • this module — RUNTIME typed access. It does NOT throw on missing
//     configuration. Throwing here would turn a config mistake into a 500 on a
//     live instance, which is precisely what the deploy gate exists to prevent.
//
// ── Why the required set is NOT re-declared here ─────────────────────────────
// Two of the five required variables are the service-role key and the Anthropic
// key. The architecture guard forbids naming either outside its owning adapter
// (`no-adhoc-service-role-client` from Component 9a, and `no-vendor-api-keys`
// from the AI platform freeze). Those rules are correct and stay: a central
// config module must not become a second place that knows privileged
// credentials. So the required list lives only in scripts/check-env.mjs, which
// is outside `src/` and outside those rules' scope — validation is a deploy-time
// concern, ownership of credentials stays with the adapter.
//
// ── Why NEXT_PUBLIC_* is not fully wrapped ───────────────────────────────────
// Next.js inlines `process.env.NEXT_PUBLIC_*` into the client bundle by literal
// text substitution at build time. Reading one through a function returns
// undefined in the browser, so client-reachable code (src/lib/supabase/client.ts,
// PostHogProvider, …) keeps direct access. This module offers typed access for
// SERVER-side reads only. Framework constraint, not preference.

/** Normalised read: an unset or whitespace-only variable is `undefined`, so
 *  callers never have to distinguish "missing" from "blank". */
function read(name: string): string | undefined {
  const raw = process.env[name]
  return raw === undefined || raw.trim() === '' ? undefined : raw
}

/** Server-only configuration. Never import from a client component. */
export const serverEnv = {
  /**
   * Canonical site origin. Consumed by the admin same-origin guard and by the
   * Stripe redirect URLs. Presence is guaranteed by the deploy gate; this
   * returns `undefined` rather than throwing so existing fallbacks still apply.
   */
  siteUrl: (): string | undefined => read('NEXT_PUBLIC_SITE_URL'),
} as const

/**
 * Numeric configuration with an explicit default. A non-numeric value falls
 * back to the default instead of producing `NaN`, which is what every existing
 * caller already relied on `Number(x ?? d)` to do — except that form yields NaN
 * for a typo, and this one does not.
 */
export function envNumber(name: string, fallback: number): number {
  const raw = read(name)
  if (raw === undefined) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Boolean configuration. Only the exact strings 'true' and 'false' are
 * honoured; anything else uses the default, so a typo cannot silently flip a
 * flag to the value it happens to coerce to.
 */
export function envBoolean(name: string, fallback: boolean): boolean {
  const raw = read(name)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}
