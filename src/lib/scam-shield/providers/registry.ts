import type { ScamShieldProvider } from './types'

const providers = new Map<string, ScamShieldProvider>()

export function registerProvider(provider: ScamShieldProvider): void {
  providers.set(provider.id, provider)
}

export function getProvider(id: string): ScamShieldProvider | undefined {
  return providers.get(id)
}

export function getAllProviders(): ScamShieldProvider[] {
  return Array.from(providers.values())
}

export function getConfiguredProviders(): ScamShieldProvider[] {
  return getAllProviders().filter(p => p.isConfigured())
}
