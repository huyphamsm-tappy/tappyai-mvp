// ── POST /api/commerce/handoff — body contract ──────────────────────────────
// Lives outside the route file because a Next.js route module may export only
// HTTP handlers and route config (the build's route type check refuses any
// other value export). The route and its test both import from here.

const LINK_ID = /^[a-f0-9]{24}$/
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLATFORMS = new Set(['web', 'android', 'ios'])

export interface HandoffBody { linkId: string; requestId: string; platform?: 'web' | 'android' | 'ios' }

/** Pure: the body a client may send, or null. Opaque ids by shape; never a URL. */
export function parseHandoffBody(raw: unknown): HandoffBody | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (typeof b.linkId !== 'string' || !LINK_ID.test(b.linkId)) return null
  if (typeof b.requestId !== 'string' || !REQUEST_ID.test(b.requestId)) return null
  const platform = typeof b.platform === 'string' && PLATFORMS.has(b.platform) ? (b.platform as HandoffBody['platform']) : undefined
  return { linkId: b.linkId, requestId: b.requestId, ...(platform ? { platform } : {}) }
}
