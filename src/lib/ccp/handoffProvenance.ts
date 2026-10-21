// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// Closeout round 6 (owner decision, PROPOSAL): is a hotel Commerce Link the handoff CCP builds from THIS row?
//
// get_hotel_prices puts a Commerce Link on a `search_results[]` row when the provider's registry grammar recognises the row's own
// `link` as a property page (grammar.ts `detail()`), optionally with the stay appended (`configure()`). The row link itself stays a
// SOURCE reference (owner decision 16/10 (b)). A Commerce Link earns an action grant only when the code can show it IS that
// handoff: the same canonical page the provider's grammar builds from the same row's link, on the provider's own host, with nothing
// in the query the same grammar would not put there. A link that merely sits in the field, or the canonical page of another row,
// or a foreign host or query, proves nothing.
//
// Reuses the CCP grammars and registry as they are (one definition): nothing here decides what a property page looks like.
import { GRAMMARS, type HandoffGrammar } from './adapters/grammar'
import { ownedUrl } from './adapters/shared'
import { providerOwning } from './discovery'
import { getProvider } from './registry'
import type { CommerceRequest, Configuration } from './domain/types'

/** Any stay: only the query KEYS `configure()` emits are compared, never the values (the dates are the user's). */
const SAMPLE_STAY = { kind: 'hotel', propertyRef: 'x', checkIn: '2030-01-01', checkOut: '2030-01-02', adults: 2 } as Configuration

/**
 * True only when `url` is the provider's canonical property page for `rowLink` (exactly, or with the query keys the same grammar's
 * `configure()` appends), the commerce link's `providerId` owns that canonical page in the registry, and the page is https on the
 * provider's allowed host.
 */
export function isRowCanonicalHandoff(url: unknown, providerId: unknown, rowLink: unknown): boolean {
  if (typeof url !== 'string' || typeof providerId !== 'string' || typeof rowLink !== 'string') return false
  const grammar = (GRAMMARS as Readonly<Record<string, HandoffGrammar>>)[providerId]
  const entry = getProvider(providerId)
  if (!grammar?.detail || !entry) return false
  // The row's own link must be on the provider's allowed host, https (the same check the adapter applies before `detail()`).
  const own = ownedUrl(entry, { url: rowLink } as Parameters<typeof ownedUrl>[1])
  if (!own) return false
  const d = grammar.detail(own, {} as CommerceRequest)
  if (!d) return false
  let target: URL, canonical: URL
  try { target = new URL(url); canonical = new URL(d.canonical) } catch { return false }
  if (target.protocol !== 'https:' || canonical.protocol !== 'https:') return false
  if (providerOwning(d.canonical) !== providerId || providerOwning(url) !== providerId) return false
  if (target.origin !== canonical.origin || target.pathname !== canonical.pathname || target.hash) return false
  if (!target.search) return true
  const configured = grammar.configure?.(d.canonical, SAMPLE_STAY)
  if (!configured) return false
  const allowed = new Set(new URL(configured.url).searchParams.keys())
  const keys = [...target.searchParams.keys()]
  return keys.length > 0 && keys.every(k => allowed.has(k)) && new Set(keys).size === keys.length
}
