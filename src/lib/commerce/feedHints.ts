// ── B5 (2026-09-20): the ingested feed is the FIRST discovery source for shopping ────────────
//
// A feed row is the merchant's own product page — the deepest destination there is, verified
// by the merchant, free of a Serper credit. Before the seam spends a `site:` search per
// subject, the ingested rows are asked by title (`commerce_feed_items`, service role); a match
// becomes a discovery hint exactly like a search hit, and CCP resolves it the same way. Title
// matching is the product-identity rule the seam already applies to search hits (§8): the
// subject's model tokens must all appear in the row's name.
//
// Never a display source (D7 is open): the hint carries the URL and the row's title only.

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeVN } from '@/lib/ai/intent'
import { productIdentityMatch } from '@/lib/links/productIdentity'

export interface FeedHint { url: string; title: string; providerId: string }

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Every subject token of ≥2 characters must appear in the row name — the same identity bar as the search path. */
export function feedRowMatches(subject: string, rowName: string): boolean {
  const s = fold(subject).split(' ').filter(t => t.length >= 2)
  if (s.length === 0) return false
  const n = ' ' + fold(rowName) + ' '
  return s.every(t => n.includes(' ' + t + ' ') || n.includes(t))
}

export type FeedReader = (subject: string, limit: number) => Promise<Array<{ provider_id: string; name: string; url: string }>>

/** Supabase reader: a case-insensitive name search narrowed by the subject's first token. Never throws. */
export const supabaseFeedReader: FeedReader = async (subject, limit) => {
  const first = fold(subject).split(' ').find(t => t.length >= 3)
  if (!first) return []
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('commerce_feed_items').select('provider_id, name, url').ilike('name', `%${first}%`).limit(limit)
    if (error) return []
    return (data ?? []) as Array<{ provider_id: string; name: string; url: string }>
  } catch { return [] }
}

/** Feed hints for one subject, best first (shorter names = more specific), at most `max`. */
export async function feedHintsFor(subject: string, opts: { reader?: FeedReader; max?: number } = {}): Promise<FeedHint[]> {
  const rows = await (opts.reader ?? supabaseFeedReader)(subject, 50)
  return rows
    .filter(r => typeof r.url === 'string' && r.url.startsWith('https://') && feedRowMatches(subject, r.name))
    // §8, the seam's own bar: a row that names another product (a case, the Pro Max) is not this subject.
    .filter(r => productIdentityMatch(subject, r.name) === 'match')
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, opts.max ?? 3)
    .map(r => ({ url: r.url, title: r.name, providerId: r.provider_id }))
}
