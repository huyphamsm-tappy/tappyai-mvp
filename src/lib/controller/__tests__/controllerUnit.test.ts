import { describe, it, expect } from 'vitest'
import { satisfies, parseVersion } from '../version'
import { createConfigProvider, defaultsSource, envSource } from '../configProvider'
import { validateManifest } from '../manifest'
import type { ConfigSource } from '../configProvider'

describe('version.satisfies', () => {
  it('exact / caret / tilde / star', () => {
    expect(satisfies('1.2.3', '1.2.3')).toBe(true)
    expect(satisfies('1.2.4', '1.2.3')).toBe(false)
    expect(satisfies('1.5.0', '^1')).toBe(true)
    expect(satisfies('2.0.0', '^1')).toBe(false)
    expect(satisfies('1.2.9', '~1.2')).toBe(true)
    expect(satisfies('1.3.0', '~1.2')).toBe(false)
    expect(satisfies('9.9.9', '*')).toBe(true)
  })
  it('fails closed on unparseable input', () => {
    expect(satisfies('not-a-version', '^1')).toBe(false)
    expect(satisfies('1.2.3', 'garbage')).toBe(false)
    expect(parseVersion('1.2')).toBeNull()
  })
})

describe('configProvider precedence', () => {
  const runtime: ConfigSource = { tier: 'runtime', get: (k) => (k === 'x' ? 'from-runtime' : undefined) }
  const prefs: ConfigSource = { tier: 'flags', get: (k) => (k === 'x' ? 'from-prefs' : undefined) }

  it('runtime beats flags beats env beats defaults', () => {
    const p = createConfigProvider([defaultsSource({ x: 'd' }), envSource(), prefs, runtime])
    expect(p.resolve('x')).toBe('from-runtime')
  })

  it('security keys ignore preference tiers', () => {
    // Treat 'flags' as a preference tier that may NOT override a security key.
    const p = createConfigProvider([defaultsSource({ x: 'secure-default' }), prefs], ['flags'])
    expect(p.resolve('x', { securityKey: true })).toBe('secure-default')
    // non-security key still lets the preference win
    expect(p.resolve('x')).toBe('from-prefs')
  })
})

describe('validateManifest fail-closed', () => {
  it('collects errors and refuses invalid input', () => {
    const r = validateManifest({ id: 'x', version: 'bad', hub: 'h' })
    expect(r.ok).toBe(false)
    expect(r.manifest).toBeUndefined()
    expect(r.errors.some((e) => e.includes('version'))).toBe(true)
  })
})
