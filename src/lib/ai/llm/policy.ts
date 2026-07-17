import type { ModelRole, ProviderId } from './types'
import { preferredProviderId } from './config'

// ── Provider Policy — the ONE provider id chosen for a role ─────────────────
// Pure function of configuration only (config.ts): the role's preferred
// provider, or the global default when no per-role override is set.
//
// Sprint 3 revision (see ADR-009): Sprint 2 originally had this return an
// ORDERED CANDIDATE LIST that the Router could fall through on failure. That
// is exactly the "auto-switch" / silent-downgrade behavior Sprint 3 forbids,
// so it's gone — this Policy names exactly one provider per role. A caller
// (the Router) that gets an id whose provider can't serve the request must
// fail loudly (UnsupportedCapabilityError / a Registry error), not try
// another id on its own.
export function resolveProviderId(role: ModelRole): ProviderId {
  return preferredProviderId(role)
}
