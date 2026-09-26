// ── LINK DEPTH — pure, client-safe (2026-09-20)
//
// Where a commerce URL lands, judged from its shape alone. This is the one piece of the outbound
// link module that the CLIENT needs (ctaValidation runs inside ChatInterface, on every client),
// so it lives here with NO imports: outboundLink.ts pulls in the CCP barrel (`node:crypto`) and
// the KV counter (Upstash), and importing it from a client component breaks `next build` with
// webpack's UnhandledSchemeError on `node:crypto`. outboundLink.ts re-exports these two names, so
// server code keeps importing them from where it always did.
//
// Not a fetch anywhere: depth is read off the URL shape, never off the page.

export type LinkDepthClass = 'product' | 'category' | 'search' | 'homepage' | 'intermediary'

const SEARCH_PATH = /(^|\/)(search|searchresults(\.[a-z-]+)?\.html|tim-kiem|s|results|restaurants)(\/|$)/i
const SEARCH_QUERY = /(^|[?&])(q|ss|query|search|keyword|searchKeyword|textToSearch|k)=/i
const INTERMEDIARY_HOST = /(^|\.)google\.[a-z.]+$|(^|\.)bing\.com$/i
const CATEGORY_PATH = /(^|\/)(danh-muc|category|categories|collections?|c|brand|thuong-hieu|shop)(\/|$)/i

/** Where a URL lands, judged from its shape. Exported for the tests and the telemetry. */
export function linkDepthClass(url: string, commerceDepth?: number, commerceKind?: string, route = false): LinkDepthClass {
  let u: URL
  try { u = new URL(url) } catch { return 'homepage' }
  if (INTERMEDIARY_HOST.test(u.hostname)) return 'intermediary'
  // A Commerce Link states its own depth: L1–L2 is a search / landing, L3+ is the subject's page.
  // A ROUTE has no deeper page than its dated fare list (L2): that list IS the route's page.
  if (typeof commerceDepth === 'number') {
    if (route) return commerceDepth >= 2 ? 'product' : 'homepage'
    if (commerceKind === 'SEARCH_HANDOFF' || commerceDepth <= 2) return 'search'
    return 'product'
  }
  const path = u.pathname.replace(/\/+$/, '')
  if (SEARCH_PATH.test(path) || SEARCH_QUERY.test(u.search)) return 'search'
  const segments = path.split('/').filter(Boolean)
  // "/", "/vi-vn", "/vn/vi" — a locale root is still the front door.
  if (segments.length === 0 || segments.every(s => /^[a-z]{2}(-[a-z]{2})?$/i.test(s))) return 'homepage'
  // A listing shape (`/danh-muc/…`, `/category/…`, `/collections/…`) is a category, not a subject.
  if (CATEGORY_PATH.test(path)) return 'category'
  return 'product'
}
