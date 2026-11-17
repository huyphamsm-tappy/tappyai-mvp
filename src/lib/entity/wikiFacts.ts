// (an organisation: founded, headquarters, country, industry, founders, CEO)
// 15/11 (owner's mockup, the profile panel: "THÔNG SỐ & DỮ LIỆU" - born, nationality, education ...): a few STRUCTURED facts about a subject, from Wikidata, the structured sibling of the Wikipedia article the profile already
// comes from. Real data with a real source, never written by a model: a fact appears only when Wikidata has it, in the person's language when Wikidata has the label (else English), and a subject with none shows no table.
// Same safety as wikiProfile.ts: FIXED hosts (the article's Wikipedia and Wikidata), the title validated, every response bounded in time and size, only known properties read, only plain bounded text returned.
//   1. the Wikipedia article's `wikibase_item` (the Wikidata id, checked against Q + digits);
//   2. that item's claims, for a small fixed list of properties (a person's or an organisation's, told by "instance of human");
//   3. the labels of the items those claims point at (a country, a school, a job) in one batched call.
import { safeGetText } from '@/lib/security/safeFetch'
import { validEntityTitle } from '@/lib/entity/wikiProfile'

export interface WikiFact { label: string; value: string }
export interface WikiFacts { facts: WikiFact[]; wikidata: string }
export type UiLang = 'vi' | 'en'
export type GetText = (url: string, signal: AbortSignal, opts: { maxBytes: number }) => Promise<{ text: string; finalUrl: string }>

const defaultGetText: GetText = (url, signal, opts) => safeGetText(url, signal, { maxBytes: opts.maxBytes })
const TIMEOUT_MS = 3000
const CLAIMS_MAX_BYTES = 1_500_000
const SMALL_MAX_BYTES = 200_000
const QID = /^Q[1-9]\d{0,11}$/
const WIKI_HOST = { vi: 'vi.wikipedia.org', en: 'en.wikipedia.org' } as const

const LABELS: Record<UiLang, Record<string, string>> = {
  vi: { born: 'Sinh', died: 'Mất', citizenship: 'Quốc tịch', education: 'Học vấn', occupation: 'Nghề nghiệp', employer: 'Nơi làm việc', founded: 'Thành lập', hq: 'Trụ sở', country: 'Quốc gia', industry: 'Lĩnh vực', founder: 'Người sáng lập', ceo: 'Giám đốc điều hành' },
  en: { born: 'Born', died: 'Died', citizenship: 'Citizenship', education: 'Education', occupation: 'Occupation', employer: 'Employer', founded: 'Founded', hq: 'Headquarters', country: 'Country', industry: 'Industry', founder: 'Founder', ceo: 'CEO' },
}

type Claim = { mainsnak?: { datavalue?: { value?: unknown } }; rank?: string }
type Claims = Record<string, Claim[] | undefined>

const items = (claims: Claims, p: string, max: number): string[] => {
  const out: string[] = []
  for (const c of claims[p] ?? []) {
    if (c.rank === 'deprecated') continue
    const v = c.mainsnak?.datavalue?.value as { id?: unknown } | undefined
    if (typeof v?.id === 'string' && QID.test(v.id) && !out.includes(v.id)) out.push(v.id)
    if (out.length >= max) break
  }
  return out
}

/** A Wikidata time as text: the year when the precision is a year or coarser, a full date (dd/mm/yyyy, or mm/yyyy) when it is finer. Pure. */
export function timeText(value: unknown, ui: UiLang): string | null {
  const v = value as { time?: unknown; precision?: unknown } | undefined
  if (typeof v?.time !== 'string' || typeof v.precision !== 'number') return null
  const m = /^([+-])(\d{1,6})-(\d{2})-(\d{2})T/.exec(v.time)
  if (!m || m[1] === '-') return null
  const y = String(Number(m[2]))
  if (v.precision <= 9) return y
  if (v.precision === 10) return ui === 'vi' ? `${m[3]}/${y}` : `${m[3]}/${y}`
  return ui === 'vi' ? `${m[4]}/${m[3]}/${y}` : `${m[3]}/${m[4]}/${y}`
}

const firstTime = (claims: Claims, p: string, ui: UiLang): string | null => {
  for (const c of claims[p] ?? []) { if (c.rank === 'deprecated') continue; const t = timeText(c.mainsnak?.datavalue?.value, ui); if (t) return t }
  return null
}
const clean = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

/**
 * The facts a set of claims gives, with the labels of the items they point at. `labelOf` maps an item id to its label (missing = the item is left out). Pure.
 * A person (instance of human, Q5): born (date, place), died, citizenship, education, occupation, employer. Anything else: founded, headquarters, country, industry, founders, CEO.
 */
export function factsFromClaims(claims: Claims, labelOf: (id: string) => string | undefined, ui: UiLang): WikiFact[] {
  const L = LABELS[ui]
  const names = (p: string, max: number) => items(claims, p, max).map(labelOf).filter((x): x is string => !!x).join(', ')
  const out: WikiFact[] = []
  const add = (label: string, value: string | null | undefined) => { if (value) out.push({ label, value }) }
  const person = items(claims, 'P31', 5).includes('Q5')
  if (person) {
    const place = names('P19', 1)
    const born = firstTime(claims, 'P569', ui)
    add(L.born, born ? (place ? `${born} (${place})` : born) : place || null)
    add(L.died, firstTime(claims, 'P570', ui))
    add(L.citizenship, names('P27', 3))
    add(L.education, names('P69', 2))
    add(L.occupation, names('P106', 3))
    add(L.employer, names('P108', 2))
  } else {
    add(L.founded, firstTime(claims, 'P571', ui))
    add(L.hq, names('P159', 1))
    add(L.country, names('P17', 1))
    add(L.industry, names('P452', 2))
    add(L.founder, names('P112', 3))
    add(L.ceo, names('P169', 1))
    // no headcount: Wikidata keeps old counts beside new ones (a measured 7,000 for a company of 100,000), and a figure of ours must not be that stale
  }
  return out.map(f => ({ label: f.label, value: clean(f.value, 160) })).filter(f => f.value).slice(0, 7)
}

const idsToLabel = (claims: Claims): string[] => {
  const props = ['P31', 'P19', 'P27', 'P69', 'P106', 'P108', 'P159', 'P17', 'P452', 'P112', 'P169']
  const max: Record<string, number> = { P31: 5, P19: 1, P27: 3, P69: 2, P106: 3, P108: 2, P159: 1, P17: 1, P452: 2, P112: 3, P169: 1 }
  return [...new Set(props.flatMap(p => items(claims, p, max[p])))].slice(0, 40)
}

async function getJson(url: string, host: string, max: number, getText: GetText): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await getText(url, ctrl.signal, { maxBytes: max })
    let h = ''
    try { h = new URL(res.finalUrl).hostname } catch { return null }
    if (h !== host) return null
    return JSON.parse(res.text)
  } catch { return null } finally { clearTimeout(timer) }
}

/** One Wikipedia article → its structured facts, or null when Wikidata has nothing usable. `wiki` is the Wikipedia the profile came from. Never throws. */
export async function fetchWikiFacts(rawTitle: string, wiki: UiLang, ui: UiLang, getText: GetText = defaultGetText): Promise<WikiFacts | null> {
  const title = validEntityTitle(rawTitle)
  if (!title) return null
  const page = await getJson(`https://${WIKI_HOST[wiki]}/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title.replace(/ /g, '_'))}`, WIKI_HOST[wiki], SMALL_MAX_BYTES, getText) as { query?: { pages?: Array<{ pageprops?: { wikibase_item?: unknown } }> } } | null
  const qid = page?.query?.pages?.[0]?.pageprops?.wikibase_item
  if (typeof qid !== 'string' || !QID.test(qid)) return null
  const ent = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json`, 'www.wikidata.org', CLAIMS_MAX_BYTES, getText) as { entities?: Record<string, { claims?: Claims }> } | null
  const claims = ent?.entities?.[qid]?.claims
  if (!claims || typeof claims !== 'object') return null
  const ids = idsToLabel(claims)
  const labels = new Map<string, string>()
  if (ids.length) {
    const lab = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=${ui === 'vi' ? 'vi|en' : 'en'}&format=json`, 'www.wikidata.org', SMALL_MAX_BYTES, getText) as { entities?: Record<string, { labels?: Record<string, { value?: unknown }> }> } | null
    for (const [id, e] of Object.entries(lab?.entities ?? {})) {
      const l = clean(e.labels?.vi?.value ?? e.labels?.en?.value, 80)
      if (QID.test(id) && l) labels.set(id, l)
    }
  }
  const facts = factsFromClaims(claims, id => labels.get(id), ui)
  return facts.length ? { facts, wikidata: `https://www.wikidata.org/wiki/${qid}` } : null
}

const HIT_TTL_MS = 6 * 60 * 60 * 1000
const MISS_TTL_MS = 30 * 60 * 1000
const MAX_ENTRIES = 300
const cache = new Map<string, { at: number; facts: WikiFacts | null }>()

/** Cached lookup (per server instance, bounded; a miss is remembered for a shorter time). */
export async function lookupWikiFacts(rawTitle: string, wiki: UiLang, ui: UiLang, getText: GetText = defaultGetText, now: number = Date.now()): Promise<WikiFacts | null> {
  const title = validEntityTitle(rawTitle)
  if (!title) return null
  const key = `${wiki}|${ui}|${title.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && now - hit.at < (hit.facts ? HIT_TTL_MS : MISS_TTL_MS)) return hit.facts
  const facts = await fetchWikiFacts(title, wiki, ui, getText)
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  cache.set(key, { at: now, facts })
  return facts
}

export const __clearWikiFactsCache = (): void => { cache.clear() }
