import type { CheckTarget, ProviderSignal } from '../types'

export interface ScamShieldProvider {
  readonly id: string
  readonly name: string
  isConfigured(): boolean
  check(target: CheckTarget, signal: AbortSignal): Promise<ProviderSignal>
}
