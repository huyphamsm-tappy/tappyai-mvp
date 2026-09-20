// ── THE RUNTIME PROVIDER REGISTRY (A3.1, 2026-09-20 — owner's list is authoritative) ──────────
//
// `providers.ts` is the TECHNICAL registry: hosts, grammars, depth audits, capabilities. Those
// change by re-verification and code review. What changes WITHOUT a deploy is the commercial
// state of a provider: whether its deeplink (affiliate wrapper) is approved, which network and
// campaign carry it, whether the provider is switched on at all, and which tier it sits in.
// That state is DATA — the `commerce_providers` table — read here through an injected source
// (CCP performs no I/O of its own; the chat seam injects the Supabase reader) and cached for a
// short TTL, so a row the owner flips lands on the next request after the cache turns over.
//
// THE CONSULTATIVE LAYER NEVER BRANCHES ON A PROVIDER. It asks `effectiveTracking(entry)` per
// link (resolver) and `isProviderActive(entry)` per adapter (orchestrator); the answers come
// from this overlay, with the code registry as the default for a provider the table does not
// mention. A row that ENABLES a deeplink must carry a campaign id (Accesstrade) or a wrapper
// template — a row that says "deeplink" with nothing to wrap with is a configuration error,
// logged, and the provider stays DIRECT: a tracked URL is never fabricated.

import type { ProviderRegistryEntry, TrackingConfig } from './types'

export type ProviderTier = 1 | 2

export interface ProviderOverride {
  providerId: string
  /** Switched off ⇒ no adapter runs, no link is emitted for this provider. */
  active: boolean
  /** Tier 1 = wrap through the network's deeplink; Tier 2 = direct merchant handoff. */
  deeplinkEnabled: boolean
  tier: ProviderTier
  network: 'accesstrade' | 'template' | null
  /** Accesstrade campaign id (public; appears in every generated link). */
  campaignId: string | null
  /** Generic wrapper: an https template with `{url}` where the encoded destination goes. */
  wrapperTemplate: string | null
  updatedAt: string | null
}

export interface ProviderConfigSource {
  /** Every row of the table. Throws on failure — the cache decides what to do with that. */
  load(): Promise<ProviderOverride[]>
}

export const PROVIDER_CONFIG_TTL_MS = 60_000

let source: ProviderConfigSource | null = null
let cache: { at: number; byId: Map<string, ProviderOverride> } | null = null
let inflight: Promise<void> | null = null

/** The chat seam injects the reader (Supabase); tests inject a fake. `null` = code registry only. */
export function setProviderConfigSource(next: ProviderConfigSource | null): void {
  source = next
  cache = null
  inflight = null
}

/** Test seam. */
export function __resetProviderConfig(): void { cache = null; inflight = null }

/**
 * Loads the overlay when the cache is cold or older than the TTL. Never throws: a source that
 * fails leaves the last good overlay in place (or none), and logs. Concurrent callers share one
 * load.
 */
export async function refreshProviderConfig(opts: { force?: boolean; now?: number } = {}): Promise<void> {
  if (!source) return
  const now = opts.now ?? Date.now()
  if (!opts.force && cache && now - cache.at < PROVIDER_CONFIG_TTL_MS) return
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const rows = await source!.load()
      const byId = new Map<string, ProviderOverride>()
      for (const r of rows) if (r && typeof r.providerId === 'string') byId.set(r.providerId, r)
      cache = { at: now, byId }
    } catch (e) {
      console.error(JSON.stringify({ type: 'tappyai_commerce_registry', step: 'load_failed', keep: cache ? 'last_good' : 'code_defaults', error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
      if (cache) cache = { ...cache, at: now } // do not hammer a failing store every request
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** The overlay row for a provider, or null when the table does not mention it (code defaults apply). */
export function providerOverride(providerId: string): ProviderOverride | null {
  return cache?.byId.get(providerId) ?? null
}

export function isProviderActive(entry: Pick<ProviderRegistryEntry, 'providerId'>): boolean {
  const o = providerOverride(entry.providerId)
  return o ? o.active : true
}

/** Tier from the table; without a row, Tier 1 iff the code registry has an approved tracking config. */
export function providerTier(entry: Pick<ProviderRegistryEntry, 'providerId' | 'tracking'>): ProviderTier {
  const o = providerOverride(entry.providerId)
  if (o) return o.deeplinkEnabled && o.active ? 1 : 2
  return entry.tracking?.approval === 'approved' ? 1 : 2
}

const logged = new Set<string>()

/**
 * The tracking configuration a link may be wrapped with, or undefined for a DIRECT link.
 *  - no row            → the code registry's own tracking config (as before)
 *  - row, deeplink off → undefined (direct), whatever the code says
 *  - row, deeplink on  → Accesstrade with the row's campaign id (falling back to the code's id),
 *                        or a template wrapper; neither present ⇒ error logged, direct
 */
export function effectiveTracking(entry: Pick<ProviderRegistryEntry, 'providerId' | 'tracking'>): TrackingConfig | undefined {
  const o = providerOverride(entry.providerId)
  if (!o) return entry.tracking
  if (!o.active || !o.deeplinkEnabled) return undefined
  if (o.network === 'template') {
    if (o.wrapperTemplate && /^https:\/\/.+\{url\}/.test(o.wrapperTemplate)) return { network: 'template', template: o.wrapperTemplate, approval: 'approved', safeWrapper: 'deep_link', unsafeWrappers: [] } as unknown as TrackingConfig
  } else {
    const campaignId = o.campaignId ?? entry.tracking?.campaignId ?? null
    if (campaignId && /^\d{10,25}$/.test(campaignId)) return { network: 'accesstrade', campaignId, approval: 'approved', safeWrapper: 'deep_link', unsafeWrappers: entry.tracking?.unsafeWrappers ?? [] }
  }
  const key = `${o.providerId}:${o.updatedAt ?? ''}`
  if (!logged.has(key)) {
    logged.add(key)
    console.error(JSON.stringify({ type: 'tappyai_commerce_registry', step: 'deeplink_enabled_without_wrapper', providerId: o.providerId, network: o.network, action: 'direct link emitted, nothing fabricated' }))
  }
  return undefined
}

/** The shape of one `commerce_providers` row, as the Supabase reader hands it over. */
export function overrideFromRow(row: Record<string, unknown>): ProviderOverride | null {
  const id = typeof row.provider_id === 'string' ? row.provider_id.trim() : ''
  if (!id) return null
  const network = row.network === 'accesstrade' || row.network === 'template' ? row.network : null
  const tier = Number(row.tier) === 1 ? 1 : 2
  return {
    providerId: id,
    active: row.active !== false,
    deeplinkEnabled: row.deeplink_enabled === true,
    tier,
    network,
    campaignId: typeof row.campaign_id === 'string' && row.campaign_id.trim() ? row.campaign_id.trim() : null,
    wrapperTemplate: typeof row.wrapper_template === 'string' && row.wrapper_template.trim() ? row.wrapper_template.trim() : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}
