// The profile panel's data table, the CLIENT side: one GET for a subject's structured facts (/api/entity-facts, from Wikidata), a session cache so a subject is asked once, and a re-check of everything that comes
// back (a response is data: the labels and values are bounded plain text, the Wikidata link must be a wikidata.org item page). No facts = no table; nothing is invented here.
export interface EntityFact { label: string; value: string }
export interface EntityFacts { facts: EntityFact[]; wikidata?: string }

const cache = new Map<string, Promise<EntityFacts>>()
const text = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** The server's answer, re-checked; an empty result when it is not usable. Pure. */
export function readFacts(raw: unknown): EntityFacts {
  const j = (raw ?? null) as { facts?: unknown; wikidata?: unknown } | null
  const facts: EntityFact[] = []
  if (Array.isArray(j?.facts)) {
    for (const f of j.facts.slice(0, 8)) {
      const label = text((f as { label?: unknown })?.label, 40)
      const value = text((f as { value?: unknown })?.value, 160)
      if (label && value) facts.push({ label, value })
    }
  }
  const wikidata = typeof j?.wikidata === 'string' && /^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9]\d{0,11}$/.test(j.wikidata) ? j.wikidata : undefined
  return { facts, ...(wikidata && facts.length ? { wikidata } : {}) }
}

export function fetchEntityFacts(title: string, wiki: 'vi' | 'en', ui: 'vi' | 'en', fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<EntityFacts> {
  const key = `${wiki}|${ui}|${title.toLowerCase()}`
  const hit = cache.get(key)
  if (hit) return hit
  const p = fetchImpl(`/api/entity-facts?t=${encodeURIComponent(title)}&w=${wiki}&ui=${ui}`)
    .then(r => (r.ok ? r.json() : null))
    .then(readFacts, () => ({ facts: [] }))
  cache.set(key, p)
  return p
}

export const __clearEntityFactsCache = (): void => { cache.clear() }
