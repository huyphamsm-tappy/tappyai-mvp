import { ExploreSession } from './ExploreSession'
import type { DurableStore, ExploreSessionEvent } from './exploreTypes'
import { track } from '@/lib/tracking/tracker'

/**
 * Web platform binding for ExploreSession (spec §8): converts browser edges
 * into plain data. This is the ONLY file in the explore module that may touch
 * browser globals — ExploreSession itself stays UI-agnostic (I11).
 *
 * One session per browser tab (frozen default: single session), durable across
 * full reloads via sessionStorage (per-tab — BT-17 isolation comes for free).
 */

const sessionStorageStore: DurableStore | null =
  typeof window === 'undefined' ? null : {
    get: (k) => window.sessionStorage.getItem(k),
    set: (k, v) => window.sessionStorage.setItem(k, v),
    remove: (k) => window.sessionStorage.removeItem(k),
  }

function emit(e: ExploreSessionEvent) {
  // Telemetry is observation only (I2). Reuses the app's existing tracker.
  const { name, ...payload } = e
  try { track(name, payload as Record<string, unknown>) } catch { /* never influence behaviour */ }
  // Dev-only inspectability (P3): expose last events for E2E capture.
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    const w = window as unknown as { __exploreSessionEvents?: ExploreSessionEvent[] }
    w.__exploreSessionEvents = [...(w.__exploreSessionEvents ?? []).slice(-19), e]
  }
}

let singleton: ExploreSession | null = null

export function getExploreSession(): ExploreSession {
  if (!singleton) {
    singleton = new ExploreSession({ store: sessionStorageStore, emit })
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __exploreSession?: unknown }
      // Inspectable in all builds via getState()/snapshot() (read-only copies).
      w.__exploreSession = singleton
    }
  }
  return singleton
}

const AUTH_KEY = 'tappy:exploreSession.auth'

/** F10: feed contents are identity-dependent. Pages report the resolved auth
 *  uid once known; a change from the last recorded identity invalidates the
 *  session. Anonymous is recorded as 'anon' so anon↔anon reloads never
 *  invalidate. Lives here (platform binding), not in ExploreSession — identity
 *  is an edge signal, not Explore business state. */
export function reportAuthState(uid: string | null): void {
  if (typeof window === 'undefined') return
  const cur = uid ?? 'anon'
  let prev: string | null = null
  try { prev = window.sessionStorage.getItem(AUTH_KEY) } catch { /* F4 */ }
  if (prev !== null && prev !== cur) getExploreSession().invalidate('auth-changed')
  try { window.sessionStorage.setItem(AUTH_KEY, cur) } catch { /* F4: never throw */ }
}

/** Test seam. */
export function resetExploreSessionForTests(): void {
  singleton?.dispose()
  singleton = null
  try { window.sessionStorage.removeItem(AUTH_KEY) } catch { /* test env */ }
}
