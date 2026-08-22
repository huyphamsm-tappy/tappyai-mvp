import { describe, it, expect, beforeEach } from 'vitest'
import {
  refreshPlatformSettings,
  resetPlatformSettingsRefresh,
  platformSettingsStoreFrom,
  PLATFORM_SETTINGS_TTL_MS,
  type SettingsQueryClient,
} from '../platformSettingsServer'
import {
  platformSettingsSnapshot,
  resetPlatformSettings,
  type PlatformSettingsStore,
} from '../platformSettings'
import { controllerConfig } from '../adminConfig'

// Controller V2 — K-2 server seam: the refresh cadence, and the proof that the
// Controller's own provider actually consults the snapshot.
//
// The second half is the one that matters. Every unit above this can pass with
// the runtime tier wired to nothing: `adminConfig.ts` builds its provider once
// at module load, and a source that captured the snapshot VALUE at that moment
// would be permanently empty while every isolated test still went green.

const ENV_KEY = 'CONTROLLER_K2_SEAM_KEY'

let reads = 0
const countingStore = (rows: Array<{ key: string; value: unknown; scope: string }> = []): PlatformSettingsStore => ({
  async readGlobal() {
    reads += 1
    return rows
  },
})

beforeEach(() => {
  reads = 0
  resetPlatformSettings()
  resetPlatformSettingsRefresh()
  delete process.env[ENV_KEY]
})

describe('K-2 · the query the store actually issues', () => {
  /** Records what was asked for, so the query is asserted rather than assumed. */
  function recordingClient(result: { data?: unknown[]; error?: { code?: string } }) {
    const calls: { table?: string; columns?: string; eq?: [string, string] } = {}
    const client: SettingsQueryClient = {
      from(table) {
        calls.table = table
        return {
          select(columns) {
            calls.columns = columns
            return {
              async eq(column, value) {
                calls.eq = [column, value]
                return { data: result.data ?? null, error: result.error ?? null }
              },
            }
          },
        }
      },
    }
    return { client, calls }
  }

  it('filters to global scope IN THE QUERY, not only in the projection', async () => {
    // `snapshotFromRows` would drop hub/module rows anyway, so dropping this
    // filter breaks nothing observable — it just pulls every scoped row in the
    // table across the wire on every Controller boot. Efficiency and
    // correctness fail differently and are asserted separately.
    const { client, calls } = recordingClient({ data: [] })
    await platformSettingsStoreFrom(client).readGlobal()
    expect(calls.table).toBe('platform_settings')
    expect(calls.eq).toEqual(['scope', 'global'])
  })

  it('selects only the three columns the snapshot needs', async () => {
    // Never `*`: `value_schema` and `updated_by` are not the provider's business.
    const { client, calls } = recordingClient({ data: [] })
    await platformSettingsStoreFrom(client).readGlobal()
    expect(calls.columns).toBe('key, value, scope')
  })

  it('THROWS on a read error rather than reporting an empty table', async () => {
    // The failure this stops: a store that returned [] on error is
    // indistinguishable from a table with no rows, so `loadPlatformSettings`
    // would replace a good snapshot with an empty one and every configured
    // setting would silently revert to its environment value.
    const { client } = recordingClient({ error: { code: '42501' } })
    await expect(platformSettingsStoreFrom(client).readGlobal()).rejects.toThrow(/42501/)
  })

  it('a null data set reads as no rows, not as a crash', async () => {
    const { client } = recordingClient({})
    await expect(platformSettingsStoreFrom(client).readGlobal()).resolves.toEqual([])
  })
})

describe('K-2 · refresh cadence', () => {
  it('loads on the first call', async () => {
    await refreshPlatformSettings({ now: 1_000, store: countingStore([{ key: 'A', value: 'x', scope: 'global' }]) })
    expect(reads).toBe(1)
    expect(platformSettingsSnapshot()).toEqual({ A: 'x' })
  })

  it('does NOT re-read inside the TTL', async () => {
    // One read per instance per TTL, not one per /admin page. Without this the
    // layout would add a service-role round trip to every navigation.
    const store = countingStore()
    await refreshPlatformSettings({ now: 1_000, store })
    await refreshPlatformSettings({ now: 1_000 + PLATFORM_SETTINGS_TTL_MS - 1, store })
    expect(reads).toBe(1)
  })

  it('re-reads once the TTL has elapsed', async () => {
    const store = countingStore()
    await refreshPlatformSettings({ now: 1_000, store })
    await refreshPlatformSettings({ now: 1_000 + PLATFORM_SETTINGS_TTL_MS, store })
    expect(reads).toBe(2)
  })

  it('force re-reads inside the TTL', async () => {
    const store = countingStore()
    await refreshPlatformSettings({ now: 1_000, store })
    await refreshPlatformSettings({ now: 1_100, force: true, store })
    expect(reads).toBe(2)
  })

  it('a failing store does not throw out of the layout', async () => {
    // This runs inside the Controller's root layout. A throw here is a 500 on
    // every single /admin page, including the ones that need no settings at all.
    await expect(
      refreshPlatformSettings({ now: 1_000, store: { readGlobal: async () => { throw new Error('boom') } } })
    ).resolves.toBeUndefined()
  })
})

describe("K-2 · the Controller's own provider reads the snapshot", () => {
  it('resolves a key that only the runtime tier holds', async () => {
    expect(controllerConfig().resolve(ENV_KEY)).toBeUndefined()
    await refreshPlatformSettings({ now: 1_000, store: countingStore([{ key: ENV_KEY, value: 'from-db', scope: 'global' }]) })
    expect(controllerConfig().resolve(ENV_KEY)).toBe('from-db')
  })

  it('the runtime tier outranks the environment in the REAL provider', async () => {
    // Not a hand-assembled provider — the one `adminConfig.ts` exports and the
    // Controller actually uses.
    process.env[ENV_KEY] = 'from-env'
    expect(controllerConfig().resolve(ENV_KEY)).toBe('from-env')
    await refreshPlatformSettings({ now: 1_000, store: countingStore([{ key: ENV_KEY, value: 'from-db', scope: 'global' }]) })
    expect(controllerConfig().resolve(ENV_KEY)).toBe('from-db')
  })

  it('a hub-scoped row never reaches the Controller key space', async () => {
    process.env[ENV_KEY] = 'from-env'
    await refreshPlatformSettings({ now: 1_000, store: countingStore([{ key: ENV_KEY, value: 'from-db', scope: 'hub' }]) })
    expect(controllerConfig().resolve(ENV_KEY)).toBe('from-env')
  })
})
