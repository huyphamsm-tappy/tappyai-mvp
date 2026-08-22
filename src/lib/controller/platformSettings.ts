// Controller V2 — K-2, the runtime configuration snapshot.
//
// PURE MODULE — safe on client and server. It holds no client, imports no
// supabase, and knows nothing about how rows arrive. The service-role adapter
// lives in `platformSettingsServer.ts`, following the seam `org/server.ts`
// established: a pure module the client bundle may pull in, and a server file
// it may not.
//
// WHY A MUTABLE SNAPSHOT RATHER THAN AN ASYNC SOURCE.
//
// `ConfigSource.get` is synchronous, because `ConfigProvider.resolve` is —
// FOUNDATION-01 §7's precedence walk cannot await four tiers on every read, and
// `adminConfig.ts` builds its provider ONCE at module load. So the DB tier
// cannot be a query; it has to be a snapshot that something refreshes. This
// module is that snapshot, and `platformSettingsSource(platformSettingsSnapshot)`
// is how the provider reads it late rather than closing over an empty object.

/** One row of `platform_settings` — `01_ARCH` §4.1. */
export interface PlatformSettingRow {
  key: string
  /** JSONB. Any JSON value, including null, which is a VALUE and not an absence. */
  value: unknown
  scope: string
}

/** The persistence port. The loader depends on this, never on a client. */
export interface PlatformSettingsStore {
  readGlobal(): Promise<readonly PlatformSettingRow[]>
}

/**
 * The scopes `01_ARCH` §4.1 names. Only `global` reaches the Controller's flat
 * key space — see `snapshotFromRows`.
 */
const GLOBAL_SCOPE = 'global'

let snapshot: Readonly<Record<string, unknown>> = Object.freeze({})

/**
 * The current runtime settings. Frozen: a caller that mutated this would change
 * configuration for every subsequent resolve in the process, from anywhere.
 */
export function platformSettingsSnapshot(): Readonly<Record<string, unknown>> {
  return snapshot
}

/**
 * Replace the snapshot WHOLESALE. Not a merge: a key deleted from the table
 * must be able to un-set a setting, and a merge would keep it alive forever.
 */
export function setPlatformSettings(entries: Record<string, unknown>): void {
  snapshot = Object.freeze({ ...entries })
}

/** Drop back to "nothing loaded". Used by tests and by an explicit reset. */
export function resetPlatformSettings(): void {
  snapshot = Object.freeze({})
}

/**
 * Project rows onto the flat key space the Configuration Provider resolves.
 *
 * ONLY `global` ROWS ARE ADMITTED, and that is the load-bearing decision here.
 * §4.1 gives the table a scope of `global|hub|module` while the provider
 * resolves one flat namespace. Flattening a hub-scoped row into it would let
 * one hub's setting answer a Controller-wide lookup — a scoping bug that would
 * present as "this value is wrong on some pages". Hub and module scoping needs
 * a consumer that does not exist yet; until it does, ignoring those rows is the
 * honest behaviour, and an unrecognised scope is ignored too rather than
 * admitted by default.
 */
export function snapshotFromRows(rows: readonly PlatformSettingRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    if (r.scope !== GLOBAL_SCOPE) continue
    out[r.key] = r.value
  }
  return out
}

/**
 * Load the store into the snapshot.
 *
 * NEVER THROWS. The Controller must not 500 because a settings table is
 * unreachable: every tier below runtime is still live, which is the entire
 * point of having precedence. On failure the previous snapshot is KEPT rather
 * than cleared — a transient read error must not silently revert configuration
 * to environment values mid-flight.
 */
export async function loadPlatformSettings(store: PlatformSettingsStore): Promise<void> {
  try {
    setPlatformSettings(snapshotFromRows(await store.readGlobal()))
  } catch {
    // Deliberately swallowed. See the contract above. There is no logging here
    // because this module is client-safe; the server adapter is where a
    // deployment-visible signal belongs if one is ever wanted.
  }
}
