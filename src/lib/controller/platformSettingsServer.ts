// Controller V2 — K-2 server seam. SERVER ONLY.
//
// This is the ONE place `platform_settings` is read, and the only file in K-2
// that imports the service-role client. It is deliberately NOT re-exported from
// `./index` — the same rule `org/server.ts` states, and for the same reason:
// `./index` is pulled into client bundles, and `createAdminClient` must never
// travel with it.
//
// The table is service-role only by migration (REVOKE from anon/authenticated,
// RLS on, zero policies), so this client is not a convenience — it is the only
// identity that can read it.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  loadPlatformSettings,
  type PlatformSettingRow,
  type PlatformSettingsStore,
} from './platformSettings'

/** How long a loaded snapshot is served before the next read. */
export const PLATFORM_SETTINGS_TTL_MS = 30_000

/**
 * The minimal query port. Declared here rather than taking a supabase-js client
 * type so this file's tests need no supabase at all — the same shape
 * `org/dbMembership.ts` uses for the membership store.
 */
export interface SettingsQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: unknown[] | null; error: { code?: string } | null }>
    }
  }
}

/**
 * Build the store over any client matching the port.
 *
 * Filters to global scope in SQL as well as in `snapshotFromRows`. That is not
 * redundancy for its own sake: the query is the EFFICIENCY (hub- and
 * module-scoped rows never cross the wire) and the projection is the
 * CORRECTNESS (they could never enter the flat key space even if they did).
 * They fail in different ways and are asserted separately.
 */
export function platformSettingsStoreFrom(client: SettingsQueryClient): PlatformSettingsStore {
  return {
    async readGlobal() {
      const { data, error } = await client
        .from('platform_settings')
        .select('key, value, scope')
        .eq('scope', 'global')
      // Thrown, not swallowed here: `loadPlatformSettings` owns the
      // never-throw contract, and it needs to see the failure to keep the
      // previous snapshot rather than replacing it with an empty one. A store
      // that returned [] on error would look exactly like an empty table, and
      // every configured setting would silently revert to its env value.
      if (error) throw new Error(`platform_settings read failed: ${error.code ?? 'unknown'}`)
      return (data ?? []) as PlatformSettingRow[]
    },
  }
}

/** The production store: the port above, over the service-role client. */
export function supabasePlatformSettingsStore(): PlatformSettingsStore {
  return platformSettingsStoreFrom(createAdminClient() as unknown as SettingsQueryClient)
}

let lastLoadedAt = 0

/**
 * Refresh the runtime configuration snapshot, at most once per TTL.
 *
 * Called from the Controller's root layout, so every /admin request runs
 * against configuration that is at most TTL old. It never throws — see
 * `loadPlatformSettings` — so a settings outage degrades to env + defaults
 * rather than taking down every Controller page.
 *
 * `now` is injectable so the TTL is testable without a fake timer, and without
 * `Date.now()` appearing in a branch nothing can reach.
 */
export async function refreshPlatformSettings(
  opts: { force?: boolean; now?: number; store?: PlatformSettingsStore } = {}
): Promise<void> {
  const now = opts.now ?? Date.now()
  if (!opts.force && lastLoadedAt !== 0 && now - lastLoadedAt < PLATFORM_SETTINGS_TTL_MS) return
  lastLoadedAt = now
  await loadPlatformSettings(opts.store ?? supabasePlatformSettingsStore())
}

/** Testing seam: forget when the last load happened. */
export function resetPlatformSettingsRefresh(): void {
  lastLoadedAt = 0
}
