import type { CheckTarget, ProviderSignal } from './types'
import { PROVIDER_TIMEOUT_MS, TOTAL_TIMEOUT_MS } from './config'
import { getConfiguredProviders } from './providers/registry'
import { isCircuitOpen, recordSuccess, recordFailure } from './providers/circuitBreaker'
import { getCachedSignals, setCachedSignal } from './cache/redisCache'

export async function executeProviders(target: CheckTarget): Promise<ProviderSignal[]> {
  const providers = getConfiguredProviders()
  if (providers.length === 0) return []

  const urlKey = target.url.toString()
  const cached = await getCachedSignals(providers.map(p => p.id), urlKey)

  const totalController = new AbortController()
  const totalTimeout = setTimeout(() => totalController.abort(), TOTAL_TIMEOUT_MS)

  try {
    const results = await Promise.allSettled(
      providers.map(async (provider): Promise<ProviderSignal> => {
        const cachedSignal = cached.get(provider.id)
        if (cachedSignal) return cachedSignal

        if (isCircuitOpen(provider.id)) {
          return {
            provider: provider.id,
            status: 'circuit_open',
            finding: 'CIRCUIT_OPEN',
            severity: 'info',
            weight: 0,
            detail: `${provider.name} temporarily unavailable`,
          }
        }

        const providerController = new AbortController()
        const providerTimeout = setTimeout(
          () => providerController.abort(),
          PROVIDER_TIMEOUT_MS,
        )

        const onTotalAbort = () => providerController.abort()
        totalController.signal.addEventListener('abort', onTotalAbort, { once: true })

        try {
          const signal = await provider.check(target, providerController.signal)
          recordSuccess(provider.id)
          if (signal.status === 'completed') {
            setCachedSignal(provider.id, urlKey, signal).catch(() => {})
          }
          return signal
        } catch (err) {
          recordFailure(provider.id)
          return {
            provider: provider.id,
            status: providerController.signal.aborted ? 'timeout' : 'error',
            finding: 'ERROR',
            severity: 'info',
            weight: 0,
            detail: `${provider.name} check failed`,
            raw: String(err),
          }
        } finally {
          clearTimeout(providerTimeout)
          totalController.signal.removeEventListener('abort', onTotalAbort)
        }
      }),
    )

    return results.map(r =>
      r.status === 'fulfilled'
        ? r.value
        : {
            provider: 'unknown',
            status: 'error' as const,
            finding: 'PROMISE_REJECTED',
            severity: 'info' as const,
            weight: 0,
            detail: 'Provider check failed unexpectedly',
          },
    )
  } finally {
    clearTimeout(totalTimeout)
  }
}
