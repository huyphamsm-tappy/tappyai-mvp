// TVI read for the place tool (14/11/2026, owner: "TVI làm luôn bây giờ"). After `search_places` has answered, the facts the store already holds about the SAME places (stored earlier by
// capturePlaces.ts, each with the date it was read) fill what THIS call did not return: the place provider drops a field from one call and gives it on the next, so a place that showed its
// hours yesterday does not lose them today. Only stable facts (address, phone, website, weekly hours); prices are never stored or read here.
//
// Rules, all on the data (nothing reads the user's words):
//  - the live row always wins: a field the live row has is never replaced, and a stored fact is never written over a live field;
//  - a stored fact rides in `known_facts` on the row with its source date, its freshness against the fact type's policy, and its verification, so the answer can say "as read on <date>";
//  - only facts whose lifecycle is ACTIVE or CANDIDATE and whose validity has not ended are read (tviStore.readFacts);
//  - it never throws and never waits long: a read that fails or takes longer than READ_TIMEOUT_MS leaves the result exactly as it was.
//
// OFF unless TVI_READ=1, and locked off in a production runtime until the owner lists the name in CONSULT_PRODUCTION_ALLOW (the same rule as the capture that fills the store).

import { lockedInProduction } from '@/lib/config/consultFlags'
import { placeEntityKey } from './contentHash'
import { freshnessOf, type Freshness } from './factTypes'
import { readFacts, type StoredFact } from './tviStore'

type Env = Record<string, string | undefined>

export const TVI_READ_FLAG = 'TVI_READ'
/** Pure. ON only for the exact value "1", and never in a production runtime unless the owner lists the name in CONSULT_PRODUCTION_ALLOW. */
export const tviReadOn = (env: Env = process.env): boolean => env[TVI_READ_FLAG] === '1' && !lockedInProduction(env, TVI_READ_FLAG)

/** Rows read per search (the first ones, which are the ones shown). */
export const READ_MAX_ROWS = 8
export const READ_TIMEOUT_MS = 1500

export interface KnownFact {
  fact_type: string
  value: unknown
  retrieved_at: string
  freshness: Freshness
  verification: string
  /** Always 'stored': read from the knowledge store, not looked up on this call. */
  from: 'stored'
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const present = (v: unknown): boolean => v !== undefined && v !== null && !(typeof v === 'string' && !v.trim()) && !(isRecord(v) && Object.keys(v).length === 0)

/** The row field each stored fact type stands in for, and how its stored value reads back. */
const FIELD_OF: Record<string, { field: string; read: (value: unknown) => unknown }> = {
  address: { field: 'address', read: v => (isRecord(v) ? v.text : undefined) },
  phone: { field: 'phone', read: v => (isRecord(v) ? v.number : undefined) },
  website: { field: 'website_uri', read: v => (isRecord(v) ? v.url : undefined) },
  opening_hours: { field: 'opening_hours_week', read: v => (isRecord(v) ? v.week : undefined) },
  // No price: a price is not a stable fact (capturePlaces.test.ts pins that the price band is left out), and the place tool already retries the band itself.
}

export const placeRowKey = (row: Record<string, unknown>, city?: string | null): string | null =>
  placeEntityKey({ placeId: typeof row.place_id === 'string' ? row.place_id : null, name: typeof row.name === 'string' ? row.name : null, city })

/**
 * Adds `known_facts` to the rows of a place-tool result that lack a field the store holds. Pure: returns a new result (the same object when nothing was added) and the counts.
 * A stored fact is added only when the live row lacks the field it stands for; of two stored versions of one fact type the most recently read wins.
 */
export function mergeStoredFacts(result: unknown, stored: readonly StoredFact[], ctx: { city?: string | null; now?: Date } = {}): { result: unknown; rowsFilled: number; factsAdded: number } {
  if (!isRecord(result) || !Array.isArray(result.results) || stored.length === 0) return { result, rowsFilled: 0, factsAdded: 0 }
  const now = ctx.now ?? new Date()
  const byKey = new Map<string, StoredFact[]>()
  for (const f of stored) byKey.set(f.entityKey, [...(byKey.get(f.entityKey) ?? []), f])
  let rowsFilled = 0
  let factsAdded = 0
  const rows = (result.results as unknown[]).map((row, i) => {
    if (!isRecord(row) || i >= READ_MAX_ROWS) return row
    const key = placeRowKey(row, ctx.city)
    const facts = key ? byKey.get(key) : undefined
    if (!facts) return row
    const best = new Map<string, StoredFact>()
    for (const f of facts) {
      const map = FIELD_OF[f.factType]
      if (!map || f.subjectKey !== '' || present(row[map.field]) || !present(map.read(f.value))) continue
      const have = best.get(f.factType)
      if (!have || Date.parse(f.retrievedAt) > Date.parse(have.retrievedAt)) best.set(f.factType, f)
    }
    if (best.size === 0) return row
    const known: KnownFact[] = [...best.values()].map(f => ({ fact_type: f.factType, value: FIELD_OF[f.factType].read(f.value), retrieved_at: f.retrievedAt, freshness: freshnessOf(f.factType, f.retrievedAt, now), verification: f.verification, from: 'stored' as const }))
    rowsFilled++
    factsAdded += known.length
    return { ...row, known_facts: known }
  })
  return rowsFilled === 0 ? { result, rowsFilled: 0, factsAdded: 0 } : { result: { ...result, results: rows }, rowsFilled, factsAdded }
}

/**
 * Reads the store for the places of a result and merges what it holds. Never throws, never waits longer than READ_TIMEOUT_MS, logs counts only. `read` is injectable for tests.
 */
export async function readTviForPlaces(
  result: unknown,
  ctx: { city?: string | null; now?: Date } = {},
  deps: { read?: (keys: readonly string[]) => Promise<StoredFact[]>; timeoutMs?: number } = {},
): Promise<unknown> {
  try {
    if (!isRecord(result) || !Array.isArray(result.results)) return result
    const keys = (result.results as unknown[]).slice(0, READ_MAX_ROWS).filter(isRecord).map(r => placeRowKey(r, ctx.city)).filter((k): k is string => !!k)
    if (keys.length === 0) return result
    const read = deps.read ?? ((k: readonly string[]) => readFacts(k))
    let timer: ReturnType<typeof setTimeout> | undefined
    const stored = await Promise.race([
      read(keys),
      new Promise<StoredFact[]>(resolve => { timer = setTimeout(() => resolve([]), deps.timeoutMs ?? READ_TIMEOUT_MS) }),
    ]).finally(() => { if (timer) clearTimeout(timer) })
    const merged = mergeStoredFacts(result, stored, ctx)
    console.log(JSON.stringify({ type: 'tappyai_tvi_read', keys: keys.length, stored: stored.length, rows_filled: merged.rowsFilled, facts_added: merged.factsAdded }))
    return merged.result
  } catch {
    return result
  }
}
