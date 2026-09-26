// ── The Supabase reader for `commerce_providers` (A3.1, 2026-09-20) ───────────────────────────
//
// CCP performs no I/O (ccpBoundary.test.ts), so the table is read HERE and injected as the
// registry's config source. Service-role client: the table has no anon / authenticated policy.
// A table that does not exist yet (migration not applied) is not an error the user sees — the
// load throws, the runtime registry keeps the code defaults and logs once per TTL.

import { createAdminClient } from '@/lib/supabase/admin'
import { overrideFromRow, setProviderConfigSource, type ProviderConfigSource, type ProviderOverride } from '@/lib/ccp'

export const COMMERCE_PROVIDERS_TABLE = 'commerce_providers'

export const supabaseProviderConfigSource: ProviderConfigSource = {
  async load(): Promise<ProviderOverride[]> {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from(COMMERCE_PROVIDERS_TABLE).select('provider_id, active, deeplink_enabled, tier, network, campaign_id, wrapper_template, updated_at')
    if (error) throw new Error(`${COMMERCE_PROVIDERS_TABLE}: ${error.message}`)
    return (Array.isArray(data) ? data : []).map(r => overrideFromRow(r as Record<string, unknown>)).filter((x): x is ProviderOverride => x !== null)
  },
}

let installed = false
/** Idempotent: the chat seam calls this before its first commerce resolution. */
export function installProviderConfigSource(): void {
  if (installed) return
  installed = true
  setProviderConfigSource(supabaseProviderConfigSource)
}
