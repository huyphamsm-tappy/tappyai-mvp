import type { LiveAction } from './liveView'

// ── Reporting a commerce handoff from the client ─────────────────────────────
// When a user follows a Commerce Link, the click is the one CCP event the
// server cannot see. This posts the OPAQUE ids the platform minted — never the
// URL, never anything about the person — with `keepalive` so the beacon
// survives the tab navigating away. Best-effort: a failure changes nothing for
// the user, and the link opens exactly as it would without it.

export const COMMERCE_HANDOFF_PATH = '/api/commerce/handoff'

/** The body `/api/commerce/handoff` accepts, or null when the action is not a commerce handoff. */
export function handoffBodyFor(action: Pick<LiveAction, 'commerce'>, platform: 'web' | 'android' | 'ios' = 'web'): { linkId: string; requestId: string; platform: string } | null {
  const c = action.commerce
  if (!c || !c.linkId || !c.requestId) return null
  return { linkId: c.linkId, requestId: c.requestId, platform }
}

export function reportCommerceHandoff(action: Pick<LiveAction, 'commerce'>, send: (path: string, body: string) => void = defaultSend): void {
  const body = handoffBodyFor(action)
  if (!body) return
  try {
    send(COMMERCE_HANDOFF_PATH, JSON.stringify(body))
  } catch {
    /* never block the link */
  }
}

function defaultSend(path: string, body: string): void {
  if (typeof fetch !== 'function') return
  void fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined)
}
