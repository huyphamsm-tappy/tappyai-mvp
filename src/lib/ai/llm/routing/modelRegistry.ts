import { getProvider, SUPPORTED_PROVIDER_IDS } from '../registry'
import type { ProviderId } from '../types'
import type { ModelCandidate } from './types'

// ── Capability registry (P1) ─────────────────────────────────────────────────
//
// Aggregates the capability metadata each ADAPTER owns and stamps it with
// runtime availability. It holds no vendor knowledge of its own: no model ids,
// no rates, no SDK details — those live in providers/ where T9 requires them.
// It holds no routing logic either; deciding is router.ts's job. This file is
// the seam between "what the fleet can do" and "what we picked".

/**
 * The fleet, as it exists right now.
 *
 * A provider with no adapter installed, or an adapter that fails to construct,
 * contributes NOTHING — never a placeholder, never a guess. That is what keeps
 * "supported by the architecture" and "actually callable" from blurring
 * together: the router can only choose from models that really exist.
 */
export function getModelCandidates(
  providerIds: readonly ProviderId[] = SUPPORTED_PROVIDER_IDS,
): ModelCandidate[] {
  const fleet: ModelCandidate[] = []
  for (const id of providerIds) {
    try {
      // The whole block is guarded, not just the lookup: a provider that fails
      // to construct, cannot report configuration, or returns malformed
      // capabilities must remove ITSELF from the fleet, never take the fleet
      // down with it. One broken adapter must not stop the others being usable.
      const provider = getProvider(id)
      const available = provider.isConfigured()
      for (const capability of provider.capabilities()) {
        fleet.push({ ...capability, available })
      }
    } catch {
      continue
    }
  }
  return fleet
}
