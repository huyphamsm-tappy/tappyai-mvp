import { PROVIDER_REGISTRY } from '../registry/providers'
import type { CommerceDomain } from '../domain/types'
import { ACCESSTRADE_WRAPPER_HOSTS } from './wrapperHosts'

// ── Recognising a tracked link after the fact (client-safe, pure) ────────────
// Commerce links also reach the user INSIDE the reply text (flight / route links rendered as
// markdown), where there is no Action and no opaque link id. When such a link is tapped the
// client still owes GA4 an `affiliate_click` — this answers "is this a tracked affiliate link,
// and whose?" from the URL alone: the wrapper host must be a known network host and the wrapped
// destination must belong to a registry provider. Only the provider slug and its first domain
// leave this function — never the URL.

const WRAPPERS: ReadonlySet<string> = new Set(ACCESSTRADE_WRAPPER_HOSTS)

export function trackedLinkFacts(href: string): { providerId: string; domain: CommerceDomain } | null {
  let wrapper: URL
  try { wrapper = new URL(href) } catch { return null }
  if (wrapper.protocol !== 'https:' || !WRAPPERS.has(wrapper.hostname.toLowerCase())) return null
  const inner = wrapper.searchParams.get('url')
  if (!inner) return null
  let host: string
  try {
    const d = new URL(inner)
    if (d.protocol !== 'https:') return null
    host = d.hostname.toLowerCase()
  } catch { return null }
  const entry = PROVIDER_REGISTRY.find(e => e.allowedHosts.includes(host))
  return entry ? { providerId: entry.providerId, domain: entry.domains[0] } : null
}
