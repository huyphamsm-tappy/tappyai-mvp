// free_lookup: the ONE light lookup a Free turn may use (owner 28/11/2026).
//
// A Free turn has no tools (owner 14/11): the model answers from what it knows. That leaves a person asking "which cơm tấm places are on Phan Xích Long" or "who is the head of
// state now" with nothing: no name, no address, no source. This tool gives Free a small, CAPPED version of what the paid plans have, and nothing more:
//
//   kind "places"  one Serper /maps request (3 credits, price retry OFF) -> name, address, rating of the top few. No phone, hours, price, website, picture or booking link.
//   kind "web"     one Serper /search request (1 credit) -> title, snippet and link of the top few, so a fact can carry its source. No page is read.
//
// The MODEL decides whether a question needs it (its description says what it is for: places, recent or contested facts, laws, news; never timeless knowledge): nothing here reads the
// person's words. The server holds the rest: FREE_LOOKUP_DAILY_CAP per person per day (env FREE_LOOKUP_DAILY_CAP, default 3), one request per call, the shared 24 h Serper cache and the
// daily credit ceiling that every Serper call already passes through (serperClient.ts). A lookup that finds nothing, or fails, is given back: it never costs the person one of their day's lookups.
// Measured 28/11/2026 with the real providers: a places lookup ~ $0.0031, a web lookup ~ $0.0012, the model's part ~ $0.00015.

import { serperPlaces, type SerperPlaceRecord } from './serperPlaces'
import { serperSearchEx } from './common'
import { incrDailyCounter } from '@/lib/security/kvCounter'

export const FREE_LOOKUP_DAILY_CAP = 3
export const FREE_LOOKUP_MAX_RESULTS = 5
const QUERY_MAX = 200

export type FreeLookupKind = 'places' | 'web'
export type FreeLookupResult =
  | { ok: true; kind: FreeLookupKind; results: Array<{ name: string; address?: string; rating?: number } | { title: string; snippet: string; link: string }>; note: string }
  | { ok: false; reason: 'daily_cap' | 'no_results'; note: string }

export interface FreeLookupDeps {
  places: (query: string, ll: null, opts: { priceRetry: boolean }) => Promise<SerperPlaceRecord[] | null>
  web: (query: string) => Promise<{ rows: Array<{ title: string; link: string; snippet: string }> | null; state: string }>
  /** Adds `by` to the person's counter for today and returns the new total. */
  count: (key: string, by: number) => Promise<number>
}

export const FREE_LOOKUP_DEPS: FreeLookupDeps = {
  places: (q, ll, opts) => serperPlaces(q, ll, opts),
  web: q => serperSearchEx(q),
  count: async (key, by) => (await incrDailyCounter(key, by)).count,
}

const dailyCap = (env: NodeJS.ProcessEnv = process.env): number => {
  const n = Number(env.FREE_LOOKUP_DAILY_CAP)
  return Number.isInteger(n) && n >= 0 && n <= 50 ? n : FREE_LOOKUP_DAILY_CAP
}

// Owner 28/11/2026: at the limit Tappy says the day's search allowance is used and offers three ways on: upgrade (the paid plans include search), come back tomorrow, or keep chatting without search.
// The number is deliberately not in this text (no digit): the model cannot repeat what it never saw.
const CAP_NOTE = 'The person has used the search allowance of their plan for today. Say so in one or two short, friendly sentences and offer these ways on, in their language: upgrade to a paid plan, which includes search; come back tomorrow, when the allowance is back; or keep chatting, without search. Do not state the number or count of lookups. Then, if you can, answer what they asked from what you reliably know, without inventing places, addresses, figures or sources.'
const NONE_NOTE = 'The lookup found nothing usable. Say so plainly and answer from what you reliably know, without inventing places, addresses, figures or sources.'
const OK_NOTE = 'List only what is in these results, each with its own source link when it has one; do not add places, addresses, figures or links that are not here, and say what the results do not cover.'

export async function runFreeLookup(
  input: { kind: FreeLookupKind; query: string; identity: string },
  deps: FreeLookupDeps = FREE_LOOKUP_DEPS,
): Promise<FreeLookupResult> {
  const query = String(input.query ?? '').replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX)
  if (!query) return { ok: false, reason: 'no_results', note: NONE_NOTE }

  const key = `free-lookup:${input.identity}`
  const used = await deps.count(key, 1)
  if (used > dailyCap()) {
    await deps.count(key, -1) // a refused request does not keep counting
    return { ok: false, reason: 'daily_cap', note: CAP_NOTE }
  }

  try {
    if (input.kind === 'places') {
      const rows = await deps.places(query, null, { priceRetry: false })
      const results = (rows ?? []).slice(0, FREE_LOOKUP_MAX_RESULTS).map(r => ({
        name: r.title,
        ...(r.address ? { address: r.address } : {}),
        ...(typeof r.rating === 'number' ? { rating: r.rating } : {}),
      }))
      if (results.length > 0) return { ok: true, kind: 'places', results, note: OK_NOTE }
    } else {
      const out = await deps.web(query)
      const results = (out.rows ?? []).slice(0, FREE_LOOKUP_MAX_RESULTS).map(r => ({ title: r.title, snippet: r.snippet, link: r.link }))
      if (results.length > 0) return { ok: true, kind: 'web', results, note: OK_NOTE }
    }
  } catch {
    // fall through: a provider that throws is the same as one that found nothing
  }
  await deps.count(key, -1) // nothing found, or it failed: given back
  return { ok: false, reason: 'no_results', note: NONE_NOTE }
}
