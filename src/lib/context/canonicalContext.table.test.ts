import { describe, it, expect } from 'vitest'
import { resolveCanonicalContext, type CanonicalContext, type LocationEvidence } from './canonicalContext'
import { CASES, PRESETS, type Case } from './canonicalContext.cases'

export const evidenceOf = (specs: string[] | undefined): LocationEvidence[] =>
  (specs ?? []).map(s => {
    const [kind, name] = s.split(':')
    const p = PRESETS[name]
    if (kind === 'gps') return { source: 'GPS', latitude: p.lat, longitude: p.lng, consentGranted: true }
    if (kind === 'gpsNoConsent') return { source: 'GPS', latitude: p.lat, longitude: p.lng, consentGranted: false }
    if (kind === 'ip') return { source: 'IP_ESTIMATE', latitude: p.lat, longitude: p.lng }
    return { source: 'PROFILE', latitude: p.lat, longitude: p.lng }
  })

export const targetKey = (c: CanonicalContext): string | null => {
  const t = c.serviceTarget
  if (t.resolution === 'UNRESOLVED') return null
  // INFERRED counts only for a carried target or the first place of a multi-place ask; an INFERRED weak location (IP / profile) is "not resolved"
  if (t.resolution === 'INFERRED' && !c.inherited && !c.multiTarget) return null
  return t.placeEntityId ?? t.cityId ?? t.countryCode ?? null
}
const keyOf = (t: { placeEntityId?: string; cityId?: string; countryCode?: string }): string | null => t.placeEntityId ?? t.cityId ?? t.countryCode ?? null

/** The fields a row asserts that the resolved context does not satisfy. */
export function misses(c: Case, got: CanonicalContext): string[] {
  const e = c.e
  const out: string[] = []
  if (got.intent !== e.intent) out.push(`intent ${got.intent} != ${e.intent}`)
  if (e.target !== undefined) {
    const k = targetKey(got)
    if (k !== e.target) out.push(`target ${k} != ${e.target}`)
  }
  if (e.role !== undefined && got.currentLocationRole !== e.role) out.push(`role ${got.currentLocationRole} != ${e.role}`)
  if (e.cross !== undefined && got.crossBorder !== e.cross) out.push(`cross ${got.crossBorder} != ${e.cross}`)
  if (e.resp !== undefined && got.languages.responseLocale.code !== e.resp) out.push(`resp ${got.languages.responseLocale.code} != ${e.resp}`)
  if (e.query !== undefined && (got.languages.queryLanguage?.code ?? null) !== e.query) out.push(`query ${got.languages.queryLanguage?.code} != ${e.query}`)
  if (e.ambig !== undefined && JSON.stringify([...got.ambiguity.map(a => a.code)].sort()) !== JSON.stringify([...e.ambig].sort())) out.push(`ambig [${got.ambiguity.map(a => a.code)}] != [${e.ambig}]`)
  if (e.dests !== undefined) {
    const d = (got.travelContext?.destinations ?? []).map(keyOf)
    if (JSON.stringify(d) !== JSON.stringify(e.dests)) out.push(`dests [${d}] != [${e.dests}]`)
  }
  if (e.origin !== undefined) {
    const o = got.travelContext?.origin ? keyOf(got.travelContext.origin) : null
    if (o !== e.origin) out.push(`origin ${o} != ${e.origin}`)
  }
  if (e.inherited !== undefined && got.inherited !== e.inherited) out.push(`inherited ${got.inherited} != ${e.inherited}`)
  if (e.eligibility !== undefined && got.eligibilityCheck !== e.eligibility) out.push(`eligibility ${got.eligibilityCheck} != ${e.eligibility}`)
  if (e.multi !== undefined && got.multiTarget !== e.multi) out.push(`multi ${got.multiTarget} != ${e.multi}`)
  if (e.locSource !== undefined && got.currentLocation.source !== e.locSource) out.push(`locSource ${got.currentLocation.source} != ${e.locSource}`)
  return out
}

export const run = (c: Case): CanonicalContext => resolveCanonicalContext({
  text: c.text, priorUserTexts: c.prior, locations: evidenceOf(c.loc), userMarketId: c.market === undefined ? 'vn' : c.market, chosenLocale: c.chosen ?? null, uiLocale: c.ui ?? null,
})

describe('Canonical Context: the labelled table (vi / en / zh x the R13 3.3 intents)', () => {
  it('has at least 80 rows with unique ids, in all three languages', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(80)
    expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
    expect(CASES.some(c => /[一-鿿]/.test(c.text))).toBe(true)
    expect(CASES.some(c => /^[\x00-\x7f]+$/.test(c.text))).toBe(true)
    for (const intent of ['NEARBY_DISCOVERY', 'EXPLICIT_DESTINATION', 'TRAVEL_PLANNING', 'GENERAL_INFORMATION', 'CURRENT_INFORMATION']) expect(CASES.filter(c => c.e.intent === intent).length).toBeGreaterThanOrEqual(8)
  })

  it('resolution accuracy on the table (every asserted field of a row must hold)', () => {
    const failed: string[] = []
    for (const c of CASES) { const m = misses(c, run(c)); if (m.length) failed.push(`${c.id} "${c.text}" -> ${m.join('; ')}`) }
    const n = CASES.length
    console.log(`CANONICAL_CONTEXT table accuracy: ${n - failed.length}/${n} = ${(((n - failed.length) / n) * 100).toFixed(1)}%`)
    expect(failed).toEqual([])
  })

  it('the UAT sentences resolve as the owner expects', () => {
    const by = (id: string) => CASES.find(c => c.id === id)!
    const hoGuom = run(by('N01'))
    expect(hoGuom.serviceTarget.placeEntityId).toBe('vn-hanoi-hoguom')
    const bangkok = run(by('T01'))
    expect(bangkok.crossBorder).toBe(true)
    expect(bangkok.travelContext?.origin?.cityId).toBe('vn-hanoi')
    const tokyo = run(by('N03'))
    expect(tokyo.serviceTarget.cityId).toBe('jp-tokyo')
    expect(tokyo.currentLocation.cityId).toBe('jp-tokyo')
  })
})
