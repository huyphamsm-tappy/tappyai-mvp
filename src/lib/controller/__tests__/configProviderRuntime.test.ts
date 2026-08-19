import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  collectModuleConfig,
  createControllerConfigProvider,
  configBoolean,
  defaultsSource,
  deferredRuntimeSource,
} from '../configProvider'
import { backofficeEnabled } from '../adminConfig'
import type { ModuleManifest } from '../types'

// Controller V2 — PHASE 4: the Configuration Provider gains module-manifest
// configuration and its FIRST production consumer.
//
// FOUNDATION-01 §7 (precedence + "never override security") and §11
// (`BACKOFFICE_ENABLED` = REFACTOR → Config Provider flag).

function manifest(id: string, configuration?: ModuleManifest['configuration']): ModuleManifest {
  return {
    id, name: id, version: '1.0.0', owner: 'test', hub: 'h',
    capabilities: [], permissions: [], dependencies: [], routes: [`/x/${id}`],
    navigation: { label: `nav.${id}`, order: 0 },
    lifecycle: 'stable', status: 'enabled', configuration,
  }
}

const ORIGINAL = process.env.BACKOFFICE_ENABLED
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BACKOFFICE_ENABLED
  else process.env.BACKOFFICE_ENABLED = ORIGINAL
})

describe('§7 — module configuration declared in manifests', () => {
  it('collects defaults across manifests', () => {
    const c = collectModuleConfig([manifest('a', { defaults: { X: 1 } }), manifest('b', { defaults: { Y: 2 } })])
    expect(c.defaults).toEqual({ X: 1, Y: 2 })
  })

  it('a key is a security key if ANY manifest says so', () => {
    const c = collectModuleConfig([
      manifest('a', { defaults: { S: 1 } }),
      manifest('b', { securityKeys: ['S'] }),
    ])
    expect(c.securityKeys.has('S')).toBe(true)
  })

  it('the first manifest to declare a default wins, deterministically', () => {
    const c = collectModuleConfig([manifest('a', { defaults: { X: 'first' } }), manifest('b', { defaults: { X: 'second' } })])
    expect(c.defaults.X).toBe('first')
  })

  it('handles manifests with no configuration at all', () => {
    expect(collectModuleConfig([manifest('a')])).toEqual({ defaults: {}, securityKeys: new Set() })
  })
})

describe('§7 — precedence', () => {
  it('environment beats a manifest default', () => {
    process.env.BACKOFFICE_ENABLED = 'false'
    const p = createControllerConfigProvider([manifest('a', { defaults: { BACKOFFICE_ENABLED: 'true' } })])
    expect(p.resolve('BACKOFFICE_ENABLED')).toBe('false')
  })

  it('falls through to the manifest default when the environment is unset', () => {
    delete process.env.BACKOFFICE_ENABLED
    const p = createControllerConfigProvider([manifest('a', { defaults: { BACKOFFICE_ENABLED: 'true' } })])
    expect(p.resolve('BACKOFFICE_ENABLED')).toBe('true')
  })

  it('the runtime tier is absent and does NOT fabricate a value', () => {
    // The honest-deferral property: absent must read as absent, so precedence
    // falls through, rather than as a value nobody configured.
    expect(deferredRuntimeSource().get('anything')).toBeUndefined()
  })

  it('a security key is not served by a preference tier', () => {
    const p = createControllerConfigProvider([manifest('a', { defaults: { SECRET: 'from-default' }, securityKeys: ['SECRET'] })])
    expect(p.isSecurityKey('SECRET')).toBe(true)
    // Still resolvable from a non-preference tier — marking it security must not
    // make it unreadable, only un-overridable by preference.
    expect(p.resolve('SECRET')).toBe('from-default')
  })

  it('returns undefined for a key no source declares — never a guess', () => {
    expect(createControllerConfigProvider([manifest('a')]).resolve('NEVER_DECLARED')).toBeUndefined()
  })
})

describe('configBoolean — strict, matching envBoolean exactly', () => {
  const p = { resolve: (k: string) => ({ t: 'true', f: 'false', junk: 'yes', num: '1', empty: '', real: true } as Record<string, unknown>)[k] }

  it.each([
    ['t', true], ['f', false], ['real', true],
  ])('honours %s', (key, expected) => {
    expect(configBoolean(p, key, !expected)).toBe(expected)
  })

  it.each(['junk', 'num', 'empty', 'absent'])('falls back rather than coercing %s', (key) => {
    // '1' and 'yes' are truthy strings. Coercing them would flip a flag on a typo.
    expect(configBoolean(p, key, false)).toBe(false)
    expect(configBoolean(p, key, true)).toBe(true)
  })
})

describe('§11 — BACKOFFICE_ENABLED resolves through the provider', () => {
  it('is true by default when unset', () => {
    delete process.env.BACKOFFICE_ENABLED
    expect(backofficeEnabled()).toBe(true)
  })

  it.each([['false', false], ['true', true]])('honours env %s', (raw, expected) => {
    process.env.BACKOFFICE_ENABLED = raw
    expect(backofficeEnabled()).toBe(expected)
  })

  it('ignores a typo instead of flipping the flag', () => {
    process.env.BACKOFFICE_ENABLED = 'FALSE'
    expect(backofficeEnabled()).toBe(true)
  })

  it('no Controller surface reads the flag straight from the environment any more', () => {
    // The refactor is only real if the old path is gone. `toContain` on the new
    // import would pass on a file that still had both.
    for (const f of ['src/app/admin/settings/page.tsx', 'src/app/api/admin/settings/route.ts']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/envBoolean\(\s*'BACKOFFICE_ENABLED'/)
    }
  })
})

describe('defaultsSource', () => {
  it('reports undefined for an absent key', () => {
    expect(defaultsSource({ a: 1 }).get('b')).toBeUndefined()
  })
})
