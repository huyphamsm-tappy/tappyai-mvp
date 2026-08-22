import { describe, it, expect, beforeEach } from 'vitest'
import { ControllerCore } from '../core'
import { validateManifest } from '../manifest'
import { buildAdminController, ADMIN_MODULES } from '../registry/adminModules'
import type { HubDescriptor, ModuleManifest } from '../types'

// Controller V2 — B14 / K-5: module data ownership.
//
// THE CONTRADICTION THIS RESOLVES, quoted from both sides:
//
//   01_ARCH §2.1  the manifest carries `data: { tables, migrations }`,
//                 "ownership assertion; no other module may query these"
//   01_ARCH §4.2  "One module owns each table | Declared in `manifest.data.tables`"
//   01_ARCH §5    validate = "schema · permission collisions · table collisions"
//
//   C6 §1, §5     "modules do not own tables in this codebase; there is nothing
//                 to collide" — and defers table-collision validation and
//                 migration versioning on exactly that basis
//
//   implemented   `ModuleManifest` had NO `data` field at all
//
// Owner Decision B14 keeps §4.2 as an architectural rule. The resolution is
// therefore NOT to repeal either side: C6's sentence is a measured statement of
// the CURRENT registry, not a repeal, and it stops being true the moment a
// module declares a table. So `data` becomes an OPTIONAL field whose ABSENCE
// means "owns no tables" — which makes all eight shipped manifests conformant
// rather than non-conformant — and the collision check §5 already specifies is
// implemented, because C6's stated reason for deferring it ("nothing to
// collide") expires the instant the field exists.
//
// `migrations` is deliberately NOT added. Its semantics are "migration
// versioning", which C6 defers as "undefined anywhere" — and that reason does
// NOT expire. A field nothing can consume is decoration.

const hub: HubDescriptor = {
  id: 'test.hub', name: 'Test', version: '1.0.0', owner: 'test',
  navigationGroup: 'g', navigationOrder: 0, lifecycle: 'stable',
}

function manifest(id: string, over: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id, name: id, version: '1.0.0', owner: 'test', hub: hub.id,
    capabilities: [], permissions: [], dependencies: [],
    routes: [`/admin/_test/${id}`],
    navigation: { label: `nav.${id}`, icon: 'X', order: 0 },
    lifecycle: 'stable', status: 'enabled', compatibility: { controller: '^1' },
    ...over,
  }
}

let core: ControllerCore

beforeEach(() => {
  core = new ControllerCore({ controllerVersion: '1.0.0' })
  core.registerHub(hub)
})

describe('absence means the module owns no tables', () => {
  it('a manifest with no `data` block is valid — this is what all eight shipped modules are', () => {
    const v = validateManifest(manifest('m.a'))
    expect(v.ok).toBe(true)
    expect(v.manifest?.data).toBeUndefined()
  })

  it('registers normally and is not treated as owning some default table', () => {
    expect(core.register(manifest('m.a')).ok).toBe(true)
    expect(core.register(manifest('m.b')).ok).toBe(true)
  })

  // Owner Decision B14 reads: "existing modules do NOT thereby acquire tables."
  //
  // Every module that existed when B14 was taken. The list is written out
  // rather than derived, because deriving it from `ADMIN_MODULES` would make it
  // grow silently and assert nothing.
  const PRE_B14_MODULES = [
    'tappy.hub.dashboard.home',
    'tappy.hub.user.management',
    'tappy.hub.analytics.content',
    'tappy.hub.analytics.auth',
    'tappy.hub.analytics.activation',
    'tappy.hub.analytics.users',
    'tappy.hub.security.audit',
    'tappy.hub.security.rbac',
    'tappy.hub.commerce.deals',
    'tappy.hub.configuration.settings',
  ]

  it('EXISTING MODULES DO NOT ACQUIRE TABLES — Owner Decision B14, stated literally', () => {
    // Originally `expect(every module).toEqual([])`, which was the same thing
    // while every module was pre-existing. Module 09 arrived on 2026-08-21 and
    // declares its own two tables — which is what ADR-024 built the field FOR,
    // and would have made a blanket assertion forbid the feature it guards.
    //
    // So the guard now names the modules the decision was about. A retroactive
    // grant to any of them still fails; a NEW module declaring its own tables
    // does not.
    const owning = ADMIN_MODULES.filter((m) => m.data !== undefined).map((m) => m.id)
    expect(owning.filter((id) => PRE_B14_MODULES.includes(id))).toEqual([])
  })

  it('the pre-B14 list is real — every id still exists in the registry', () => {
    // Without this, renaming a module would quietly drop it from the guard.
    const ids = ADMIN_MODULES.map((m) => m.id)
    expect(PRE_B14_MODULES.filter((id) => !ids.includes(id))).toEqual([])
  })

  it('Module 09 owns exactly its own two tables, and no other module owns any', () => {
    const owners = Object.fromEntries(
      ADMIN_MODULES.filter((m) => m.data).map((m) => [m.id, [...m.data!.tables].sort()])
    )
    expect(owners).toEqual({
      'tappy.hub.user.moderation': ['moderation_actions', 'moderation_queue'],
    })
  })

  it('the real production registry still builds', () => {
    expect(() => buildAdminController()).not.toThrow()
  })
})

describe('table collision — 01_ARCH §5, deferred by C6 only while nothing could collide', () => {
  it('two modules may not own the same table', () => {
    expect(core.register(manifest('m.a', { data: { tables: ['user_notes'] } })).ok).toBe(true)

    const second = core.register(manifest('m.b', { data: { tables: ['user_notes'] } }))
    expect(second.ok).toBe(false)
    expect(second.ok === false && second.errors.join(' ')).toContain('user_notes')
    expect(second.ok === false && second.errors.join(' ')).toContain('m.a')
  })

  it('a collision registers NOTHING — no partial load', () => {
    core.register(manifest('m.a', { data: { tables: ['user_notes'] } }))
    core.register(manifest('m.b', { data: { tables: ['user_notes'] } }))
    expect(core.getModule('m.b')).toBeUndefined()
  })

  it('is CASE-INSENSITIVE — unquoted Postgres identifiers fold, so these are one table', () => {
    core.register(manifest('m.a', { data: { tables: ['user_notes'] } }))
    const second = core.register(manifest('m.b', { data: { tables: ['USER_NOTES'] } }))
    expect(second.ok).toBe(false)
  })

  it('ignores surrounding whitespace when comparing', () => {
    core.register(manifest('m.a', { data: { tables: ['user_notes'] } }))
    expect(core.register(manifest('m.b', { data: { tables: [' user_notes '] } })).ok).toBe(false)
  })

  it('different tables do not collide', () => {
    core.register(manifest('m.a', { data: { tables: ['user_notes'] } }))
    expect(core.register(manifest('m.b', { data: { tables: ['moderation_queue'] } })).ok).toBe(true)
  })

  it('a module repeating its OWN table is not a collision — `tables` is a list, not a set', () => {
    // Mirrors the permission-collision rule, which dedupes for the same reason:
    // a repeated declaration is sloppy, not ambiguous.
    const r = core.register(manifest('m.a', { data: { tables: ['user_notes', 'user_notes'] } }))
    expect(r.ok).toBe(true)
  })

  it('reports the conflict once per colliding table, not once per repetition', () => {
    core.register(manifest('m.a', { data: { tables: ['user_notes'] } }))
    const second = core.register(manifest('m.b', { data: { tables: ['user_notes', 'user_notes'] } }))
    const hits = second.ok === false ? second.errors.filter((e) => e.includes('user_notes')).length : -1
    expect(hits).toBe(1)
  })

  it('an unowned table never collides with a module that owns nothing', () => {
    core.register(manifest('m.a'))
    expect(core.register(manifest('m.b', { data: { tables: ['user_notes'] } })).ok).toBe(true)
  })
})

describe('manifest validation of the `data` block', () => {
  it('accepts a well-formed declaration', () => {
    expect(validateManifest(manifest('m.a', { data: { tables: ['user_notes'] } })).ok).toBe(true)
  })

  // ⚠️ These assert the EXACT message, not a substring.
  //
  // Mutations B7 and B8 survived the first run against `toContain('data')` and
  // `toContain('data.tables')`: deleting the shape check let the input fall
  // through to a LATER branch, which pushed a different error that still
  // matched. The manifest was still rejected, so `ok:false` held — the tests
  // were green for the wrong reason and proved nothing about which rule ran.
  // Naming the message is what makes each branch independently observable.

  it('rejects `data` that is not an object, by that rule specifically', () => {
    const v = validateManifest({ ...manifest('m.a'), data: 'user_notes' })
    expect(v.ok).toBe(false)
    expect(v.errors).toContain('data: must be an object when present')
  })

  it('rejects `data` given as an array', () => {
    const v = validateManifest({ ...manifest('m.a'), data: ['user_notes'] })
    expect(v.ok).toBe(false)
    expect(v.errors).toContain('data: must be an object when present')
  })

  it('rejects `tables` that is not a string array, by that rule specifically', () => {
    const v = validateManifest({ ...manifest('m.a'), data: { tables: [1, 2] } })
    expect(v.ok).toBe(false)
    expect(v.errors).toContain('data.tables: required string[]')
  })

  it('rejects a missing `tables` key', () => {
    const v = validateManifest({ ...manifest('m.a'), data: {} })
    expect(v.ok).toBe(false)
    expect(v.errors).toContain('data.tables: required string[]')
  })

  it('rejects an EMPTY `tables` array — absence already says "owns nothing"', () => {
    // A present-but-empty declaration is a statement with no content, and it
    // would let a manifest look like it had answered the ownership question.
    const v = validateManifest({ ...manifest('m.a'), data: { tables: [] } })
    expect(v.ok).toBe(false)
    expect(v.errors).toContain('data.tables: must be non-empty — omit `data` to own no tables')
  })

  it('rejects a blank table name, by that rule specifically', () => {
    const v = validateManifest({ ...manifest('m.a'), data: { tables: ['  '] } })
    expect(v.ok).toBe(false)
    expect(v.errors).toContain('data.tables: table names must be non-empty strings')
  })

  it('does NOT enforce the §4.2 `<hub>_<module>_<entity>` naming rule', () => {
    // Stated as a deliberate non-enforcement, not an oversight. §4.2's naming
    // rule describes tables created under V2; every table a module could claim
    // today predates it (`account_status`, `audit_log`, `event_outbox`), so
    // enforcing it would reject the first real declaration. Changing that is an
    // Owner decision, and this test fails if someone adds the rule silently.
    expect(validateManifest(manifest('m.a', { data: { tables: ['account_status'] } })).ok).toBe(true)
  })
})
