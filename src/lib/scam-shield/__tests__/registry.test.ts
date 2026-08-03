import { describe, it, expect } from 'vitest'
import { registerProvider, getProvider, getAllProviders, getConfiguredProviders } from '../providers/registry'
import type { ScamShieldProvider } from '../providers/types'
import type { CheckTarget, ProviderSignal } from '../types'

function makeProvider(id: string, configured = true): ScamShieldProvider {
  return {
    id,
    name: `Test ${id}`,
    isConfigured: () => configured,
    check: async (_target: CheckTarget, _signal: AbortSignal): Promise<ProviderSignal> => ({
      provider: id,
      status: 'completed',
      finding: 'TEST',
      severity: 'safe',
      weight: 0,
      detail: 'test',
    }),
  }
}

describe('provider registry', () => {
  it('registers and retrieves a provider', () => {
    const p = makeProvider('reg-test-1')
    registerProvider(p)
    expect(getProvider('reg-test-1')).toBe(p)
  })

  it('returns undefined for unknown provider', () => {
    expect(getProvider('nonexistent')).toBeUndefined()
  })

  it('lists all registered providers', () => {
    registerProvider(makeProvider('reg-test-2'))
    registerProvider(makeProvider('reg-test-3'))
    const all = getAllProviders()
    expect(all.some(p => p.id === 'reg-test-2')).toBe(true)
    expect(all.some(p => p.id === 'reg-test-3')).toBe(true)
  })

  it('filters to configured providers only', () => {
    registerProvider(makeProvider('reg-configured', true))
    registerProvider(makeProvider('reg-unconfigured', false))
    const configured = getConfiguredProviders()
    expect(configured.some(p => p.id === 'reg-configured')).toBe(true)
    expect(configured.some(p => p.id === 'reg-unconfigured')).toBe(false)
  })
})
