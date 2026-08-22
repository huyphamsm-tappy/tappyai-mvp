import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createControllerConfigProvider,
  platformSettingsSource,
  deferredRuntimeSource,
} from '../configProvider'
import {
  platformSettingsSnapshot,
  setPlatformSettings,
  resetPlatformSettings,
  snapshotFromRows,
  loadPlatformSettings,
  type PlatformSettingRow,
  type PlatformSettingsStore,
} from '../platformSettings'
import type { ModuleManifest } from '../types'

// Controller V2 — K-2, the Configuration Provider's RUNTIME tier.
//
// FOUNDATION-01 §7 fixes the precedence as runtime (DB/API) > flags > env >
// build-time defaults. Every tier below runtime has been live since Phase 4;
// the top one was an adapter that returned undefined, because the table it
// needs did not exist. `configProvider.ts` said so in its own header, and
// `adminConfig.ts` said "the provider is where the runtime (DB/API) tier lands
// when platform_settings exists".
//
// Owner Decision D1b (2026-08-22) made `01_CONTROLLER_V2_ARCHITECTURE.md` §4.1
// the schema authority for that table and authorized both the migration and
// this tier. These tests are the contract.
//
// THE RISK THIS TIER INTRODUCES, stated rather than discovered later: the
// runtime tier outranks the environment, so a row in `platform_settings` can
// override a value an operator set in Vercel. That is the contract's ordering,
// not an accident — and it is exactly why the table is service-role only with
// RLS on and zero policies. The boundary is asserted at the bottom of this file.

const ROOT = join(__dirname, '../../../..')
const MIGRATION = readFileSync(join(ROOT, 'supabase/migrations/20260822_k2_platform_settings.sql'), 'utf8')

function manifest(id: string, configuration?: ModuleManifest['configuration']): ModuleManifest {
  return {
    id, name: id, version: '1.0.0', owner: 'test', hub: 'h',
    capabilities: [], permissions: [], dependencies: [], routes: [`/x/${id}`],
    navigation: { label: `nav.${id}`, order: 0 },
    lifecycle: 'stable', status: 'enabled', configuration,
  }
}

const ENV_KEY = 'CONTROLLER_K2_TEST_KEY'
beforeEach(() => {
  resetPlatformSettings()
  delete process.env[ENV_KEY]
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-2 · the runtime source itself', () => {
  it('declares the runtime tier — not env, not defaults', () => {
    // The tier string is what places it in TIER_PRECEDENCE. A source that
    // claimed `env` would be consulted after flags and the whole point is lost.
    expect(platformSettingsSource(() => ({})).tier).toBe('runtime')
  })

  it('serves a value the snapshot holds', () => {
    expect(platformSettingsSource(() => ({ A: 'from-db' })).get('A')).toBe('from-db')
  })

  it('returns undefined for a key it does not hold, so precedence falls through', () => {
    expect(platformSettingsSource(() => ({ A: 1 })).get('B')).toBeUndefined()
  })

  it('reads the snapshot at RESOLVE time, not at construction', () => {
    // This is what lets a provider built once at module load — which is how
    // `adminConfig.ts` builds it — see settings loaded later in the request.
    // A source that closed over the snapshot value would be permanently empty.
    let snap: Record<string, unknown> = {}
    const src = platformSettingsSource(() => snap)
    expect(src.get('A')).toBeUndefined()
    snap = { A: 'arrived-later' }
    expect(src.get('A')).toBe('arrived-later')
  })

  it('a stored null is a VALUE, not an absence', () => {
    // JSONB null is a deliberate setting. Treating it as absent would silently
    // hand the answer to the environment — the opposite of what the operator
    // who stored it asked for. Only `undefined` means "this tier has no say".
    process.env[ENV_KEY] = 'from-env'
    const p = createControllerConfigProvider([manifest('a')], [platformSettingsSource(() => ({ [ENV_KEY]: null }))])
    expect(p.resolve(ENV_KEY)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-2 · precedence — FOUNDATION-01 §7', () => {
  it('runtime beats the environment', () => {
    process.env[ENV_KEY] = 'from-env'
    const p = createControllerConfigProvider([manifest('a')], [platformSettingsSource(() => ({ [ENV_KEY]: 'from-db' }))])
    expect(p.resolve(ENV_KEY)).toBe('from-db')
  })

  it('runtime beats a manifest default', () => {
    const p = createControllerConfigProvider(
      [manifest('a', { defaults: { [ENV_KEY]: 'from-default' } })],
      [platformSettingsSource(() => ({ [ENV_KEY]: 'from-db' }))]
    )
    expect(p.resolve(ENV_KEY)).toBe('from-db')
  })

  it('with the runtime tier silent, env still beats defaults — nothing below changed', () => {
    process.env[ENV_KEY] = 'from-env'
    const p = createControllerConfigProvider(
      [manifest('a', { defaults: { [ENV_KEY]: 'from-default' } })],
      [platformSettingsSource(() => ({}))]
    )
    expect(p.resolve(ENV_KEY)).toBe('from-env')
  })

  it('a security key IS servable from runtime — runtime is not a preference tier', () => {
    // §7 bars USER/ROLE PREFERENCE from overriding a security key. The runtime
    // DB tier is not preference; it is the operator's own configuration store,
    // and it sits above env by contract. Barring it here would invent a rule.
    const p = createControllerConfigProvider(
      [manifest('a', { defaults: { SECRET: 'from-default' }, securityKeys: ['SECRET'] })],
      [platformSettingsSource(() => ({ SECRET: 'from-db' }))]
    )
    expect(p.isSecurityKey('SECRET')).toBe(true)
    expect(p.resolve('SECRET')).toBe('from-db')
  })

  it('the deferred source still exists and still fabricates nothing', () => {
    expect(deferredRuntimeSource().get('anything')).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-2 · the snapshot store', () => {
  it('starts empty — an unloaded Controller has no runtime settings, not stale ones', () => {
    expect(platformSettingsSnapshot()).toEqual({})
  })

  it('replaces wholesale rather than merging', () => {
    // A merge would keep a key that was DELETED from the table alive forever.
    // Deleting a row must be able to un-set a setting.
    setPlatformSettings({ A: 1, B: 2 })
    setPlatformSettings({ A: 9 })
    expect(platformSettingsSnapshot()).toEqual({ A: 9 })
  })

  it('the exposed snapshot cannot be mutated by a caller', () => {
    setPlatformSettings({ A: 1 })
    const snap = platformSettingsSnapshot() as Record<string, unknown>
    expect(() => { snap.A = 'tampered' }).toThrow()
    expect(platformSettingsSnapshot().A).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-2 · rows → snapshot', () => {
  const rows = (...r: PlatformSettingRow[]) => r

  it('keeps global-scope rows', () => {
    expect(snapshotFromRows(rows({ key: 'A', value: 'x', scope: 'global' }))).toEqual({ A: 'x' })
  })

  it('DROPS hub- and module-scoped rows', () => {
    // §4.1 gives the table a scope of global|hub|module, and the Controller's
    // provider resolves a FLAT key space. Loading a hub-scoped row into it
    // would let one hub's setting answer a Controller-wide lookup. Hub and
    // module scoping needs a consumer that does not exist; until it does, the
    // honest behaviour is to ignore those rows, not to flatten them.
    const snap = snapshotFromRows(rows(
      { key: 'A', value: 'global', scope: 'global' },
      { key: 'B', value: 'hub', scope: 'hub' },
      { key: 'C', value: 'module', scope: 'module' },
    ))
    expect(snap).toEqual({ A: 'global' })
  })

  it('preserves JSONB shape verbatim — objects, arrays, numbers, booleans, null', () => {
    const snap = snapshotFromRows(rows(
      { key: 'obj', value: { a: 1 }, scope: 'global' },
      { key: 'arr', value: [1, 2], scope: 'global' },
      { key: 'num', value: 42, scope: 'global' },
      { key: 'bool', value: false, scope: 'global' },
      { key: 'nul', value: null, scope: 'global' },
    ))
    expect(snap).toEqual({ obj: { a: 1 }, arr: [1, 2], num: 42, bool: false, nul: null })
  })

  it('an unknown scope is dropped, not admitted by default', () => {
    // Fail closed: a scope value this code does not understand must not land in
    // the global key space just because it is not recognised.
    expect(snapshotFromRows(rows({ key: 'A', value: 'x', scope: 'universe' }))).toEqual({})
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-2 · the loader', () => {
  const store = (impl: PlatformSettingsStore['readGlobal']): PlatformSettingsStore => ({ readGlobal: impl })

  it('loads rows into the snapshot', async () => {
    await loadPlatformSettings(store(async () => [{ key: 'A', value: 'x', scope: 'global' }]))
    expect(platformSettingsSnapshot()).toEqual({ A: 'x' })
  })

  it('a read failure leaves the Controller running on env + defaults, and does NOT throw', async () => {
    // The Controller must not 500 because a settings table is unreachable.
    // Every tier below runtime is still live, and that is the whole point of
    // precedence. Throwing here would take down every /admin page.
    await expect(loadPlatformSettings(store(async () => { throw new Error('boom') }))).resolves.toBeUndefined()
    expect(platformSettingsSnapshot()).toEqual({})
  })

  it('a read failure does not wipe settings that were already loaded', async () => {
    await loadPlatformSettings(store(async () => [{ key: 'A', value: 'x', scope: 'global' }]))
    await loadPlatformSettings(store(async () => { throw new Error('boom') }))
    expect(platformSettingsSnapshot()).toEqual({ A: 'x' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('K-2 · the migration implements 01_ARCH §4.1 and nothing more', () => {
  const ddl = MIGRATION.replace(/--[^\n]*/g, '')

  it('creates public.platform_settings', () => {
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS public\.platform_settings/i)
  })

  it.each([
    ['key', /\bkey\s+TEXT\s+PRIMARY KEY\b/i],
    ['value', /\bvalue\s+JSONB\s+NOT NULL\b/i],
    ['scope', /\bscope\s+TEXT\s+NOT NULL\b/i],
    ['value_schema', /\bvalue_schema\s+TEXT\b/i],
    ['updated_by', /\bupdated_by\s+UUID\b/i],
  ])('declares §4.1 column %s', (_name, re) => {
    expect(ddl).toMatch(re)
  })

  it('declares EXACTLY the five columns §4.1 names — no invented sixth', () => {
    // D1b made §4.1 the schema authority precisely so columns are not invented
    // here. `updated_at` is the tempting one and it is deliberately absent:
    // adding it would be this workstream writing schema, which is the thing the
    // decision exists to prevent.
    const body = ddl.match(/CREATE TABLE IF NOT EXISTS public\.platform_settings\s*\(([\s\S]*?)\n\);/i)
    expect(body).not.toBeNull()
    const columns = body![1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('CONSTRAINT') && !l.startsWith('CHECK'))
      .map((l) => l.split(/\s+/)[0])
    expect(columns.sort()).toEqual(['key', 'scope', 'updated_by', 'value', 'value_schema'])
  })

  it('constrains scope to the three §4.1 names', () => {
    expect(ddl).toMatch(/CHECK\s*\(\s*scope\s+IN\s*\(\s*'global'\s*,\s*'hub'\s*,\s*'module'\s*\)\s*\)/i)
  })
})

describe('K-2 · the access boundary — ADR-019', () => {
  const ddl = MIGRATION.replace(/--[^\n]*/g, '')

  it('revokes the born-open grants from anon and authenticated', () => {
    // A new table here is born with pg_default_acl granting anon and
    // authenticated everything. This table can override SECURITY KEYS through
    // the runtime tier, so an anonymous write to it would be an authorization
    // bypass, not a data leak.
    expect(ddl).toMatch(/REVOKE ALL ON TABLE public\.platform_settings FROM PUBLIC, anon, authenticated/i)
  })

  it('grants service_role only', () => {
    expect(ddl).toMatch(/GRANT\s+ALL ON TABLE public\.platform_settings TO service_role/i)
    expect(ddl).not.toMatch(/GRANT[^\n]*TO\s+(anon|authenticated)/i)
  })

  it('enables RLS with zero policies', () => {
    expect(ddl).toMatch(/ALTER TABLE public\.platform_settings ENABLE ROW LEVEL SECURITY/i)
    expect(ddl).not.toMatch(/CREATE POLICY/i)
  })

  it('ships a rollback', () => {
    expect(() =>
      readFileSync(join(ROOT, 'supabase/migrations/rollback/20260822_k2_platform_settings_rollback.sql'), 'utf8')
    ).not.toThrow()
  })
})
