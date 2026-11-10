// TVI capture from the place tool (R13 §8, slice 2b). After `search_places` has answered, the stable facts of each place row (address, phone, website, weekly opening hours)
// are STAGED in the TVI store as CANDIDATES with a reference to where they were read. It never changes the answer: it runs after the result is built, never throws, and logs only counts.
//
// OFF unless TVI_CAPTURE=1, and locked off in a production runtime until the owner lists the name in CONSULT_PRODUCTION_ALLOW. It stays off until Legal confirms what may be stored from
// the search providers (R13 §21 item 48): the store keeps the extracted facts and a reference + hash of the source, never a text excerpt.

import { lockedInProduction } from '@/lib/config/consultFlags'
import { contentHashOf, placeEntityKey } from './contentHash'
import { FACT_TYPES, type KnownFactType } from './factTypes'
import { attachEvidence, stageFact, type StageResult } from './tviStore'

type Env = Record<string, string | undefined>

export const TVI_CAPTURE_FLAG = 'TVI_CAPTURE'
/** Pure. ON only for the exact value "1", and never in a production runtime unless the owner lists the name in CONSULT_PRODUCTION_ALLOW. */
export const tviCaptureOn = (env: Env = process.env): boolean => env[TVI_CAPTURE_FLAG] === '1' && !lockedInProduction(env, TVI_CAPTURE_FLAG)

/** Rows captured per search, and facts per row: a bound on the writes one search can cause. */
export const CAPTURE_MAX_ROWS = 5

export interface PlaceFactDraft {
  factType: KnownFactType
  value: unknown
}

export interface PlaceCapture {
  entityKey: string
  canonicalName: string
  lat: number | null
  lng: number | null
  mapsLink: string | null
  facts: PlaceFactDraft[]
}

const text = (v: unknown, max = 300): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The stable facts of one place row, as the place tool builds it (serperPlaceToRow). A fact that is absent stays absent: silence is never turned into a value. A row with no name and
 * no provider id has nothing to key on and yields null. Pure.
 */
export function placeFactsFromRow(row: Record<string, unknown>, city?: string | null): PlaceCapture | null {
  const name = text(row.name, 300)
  const key = placeEntityKey({ placeId: text(row.place_id, 160), name, city })
  if (!name || !key) return null
  const facts: PlaceFactDraft[] = []
  const address = text(row.address)
  if (address) facts.push({ factType: 'address', value: { text: address } })
  const phone = text(row.phone, 40)
  if (phone) facts.push({ factType: 'phone', value: { number: phone } })
  const website = text(row.website_uri, 400)
  if (website && /^https?:\/\//i.test(website)) facts.push({ factType: 'website', value: { url: website } })
  if (isRecord(row.opening_hours_week)) {
    const week: Record<string, string> = {}
    for (const [day, hours] of Object.entries(row.opening_hours_week)) {
      const d = text(day, 40), h = text(hours, 80)
      if (d && h) week[d] = h
    }
    if (Object.keys(week).length > 0) facts.push({ factType: 'opening_hours', value: { week } })
  }
  const lat = typeof row.lat === 'number' && Number.isFinite(row.lat) ? row.lat : null
  const lng = typeof row.lng === 'number' && Number.isFinite(row.lng) ? row.lng : null
  return { entityKey: key, canonicalName: name, lat, lng, mapsLink: text(row.maps_link, 400), facts }
}

export interface CaptureCounts { rows: number; created: number; staged: number; unchanged: number; evidence: number; failed: number }

/**
 * Stages the facts of the first rows of a place-tool result. Never throws; returns the counts (also logged, counts only). `stage`/`attach` are injectable for tests.
 */
export async function captureTviFromPlaces(
  result: unknown,
  ctx: { city?: string | null; now?: Date } = {},
  deps: { stage?: typeof stageFact; attach?: typeof attachEvidence } = {},
): Promise<CaptureCounts> {
  const counts: CaptureCounts = { rows: 0, created: 0, staged: 0, unchanged: 0, evidence: 0, failed: 0 }
  try {
    const stage = deps.stage ?? stageFact
    const attach = deps.attach ?? attachEvidence
    const r = isRecord(result) ? result : null
    const rows = r && Array.isArray(r.results) ? (r.results as unknown[]).filter(isRecord).slice(0, CAPTURE_MAX_ROWS) : []
    const now = ctx.now ?? new Date()
    const parsed = r && typeof r.retrieved_at === 'string' ? new Date(r.retrieved_at) : null
    const retrievedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : now
    for (const row of rows) {
      const cap = placeFactsFromRow(row, ctx.city)
      if (!cap || cap.facts.length === 0) continue
      counts.rows++
      for (const f of cap.facts) {
        const res: StageResult = await stage({
          entityType: 'place', entityKey: cap.entityKey, canonicalName: cap.canonicalName, city: ctx.city ?? null,
          factType: f.factType, value: f.value, observedAt: retrievedAt, retrievedAt, actor: 'capture.places',
        })
        if (!res.ok) { counts.failed++; continue }
        counts[res.outcome]++
        if (res.outcome === 'unchanged') continue
        const ev = await attach({
          versionId: res.versionId, sourceType: 'PROVIDER_API', domain: 'maps.google.com', publisher: 'Google Maps (via Serper)',
          reference: cap.mapsLink, contentHash: contentHashOf({ factType: f.factType, value: f.value }), retrievedAt,
          policyVersion: FACT_TYPES[f.factType].policyId, evaluator: 'capture.places.v1',
        })
        if (ev.ok) counts.evidence++
        else counts.failed++
      }
    }
  } catch {
    counts.failed++
  }
  console.log(JSON.stringify({ type: 'tappyai_tvi_capture', ...counts }))
  return counts
}
