// TVI ingestion of OFFICIAL content (R13 §8, phase B). For a small curated list of official pages (a government or heritage-authority site, a venue's own site) it reads the page with the safe
// fetcher, takes the facts the page itself declares as schema.org structured data (address, phone, opening hours, a VND offer price), checks each value for plausibility, STAGES them as
// CANDIDATES under an `attraction` entity and attaches the page as SUPPORTS evidence of the right source type. The evidence gate (maintain.ts) then decides what becomes ACTIVE.
//
// Deliberate limits: no model reads the page (no cost, nothing invented): a page with no structured data yields no facts. No excerpt of the page is stored (reference + hash only). A redirect to
// another host is refused. A price is never promoted on one source (evidenceGate.ts): it waits for a second source or a reviewer.
//
// OFF unless TVI_INGEST=1, and locked off in a production runtime until the owner lists the name in CONSULT_PRODUCTION_ALLOW (and Legal has confirmed what may be stored).

import { lockedInProduction } from '@/lib/config/consultFlags'
import { normalizeVietnamese } from '@/lib/chat/workspace/historyModel'
import { extractPage, type PageDoc } from '@/lib/ai/agent/runtime/pageExtract'
import type { PageFetchResult } from '@/lib/security/safePageFetch'
import { contentHashOf } from './contentHash'
import { FACT_TYPES, type KnownFactType } from './factTypes'
import { attachEvidence, stageFact, type StageResult } from './tviStore'

type Env = Record<string, string | undefined>

export const TVI_INGEST_FLAG = 'TVI_INGEST'
/** Pure. ON only for the exact value "1", and never in a production runtime unless the owner lists the name in CONSULT_PRODUCTION_ALLOW. */
export const tviIngestOn = (env: Env = process.env): boolean => env[TVI_INGEST_FLAG] === '1' && !lockedInProduction(env, TVI_INGEST_FLAG)

/** The most pages one run reads: a bound on the fetches (and the writes) of one pass. */
export const INGEST_MAX_TARGETS = 50
export const INGEST_ACTOR = 'ingest.official'

export interface OfficialTarget {
  /** `attraction:<slug>` */
  entityKey: string
  name: string
  city: string
  /** An https page of the official source. */
  url: string
  sourceType: 'GOVERNMENT' | 'OFFICIAL_BUSINESS'
}

const hostOf = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, '')

/** Pure. A target is usable only if it is an https page on a named host (no IP, no credentials), keyed as an attraction, from an OFFICIAL source type. */
export function isOfficialTarget(t: OfficialTarget): boolean {
  if (!t || typeof t.name !== 'string' || !t.name.trim() || !/^attraction:[a-z0-9][a-z0-9-]{1,120}$/.test(t.entityKey)) return false
  if (t.sourceType !== 'GOVERNMENT' && t.sourceType !== 'OFFICIAL_BUSINESS') return false
  try {
    const u = new URL(t.url)
    if (u.protocol !== 'https:' || u.username || u.password) return false
    if (/^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || !u.hostname.includes('.')) return false
    return true
  } catch {
    return false
  }
}

export interface OfficialFactDraft { factType: KnownFactType; value: unknown }

const norm = (s: string) => normalizeVietnamese(s).replace(/[^a-z0-9]+/g, ' ').trim()
function nameMatches(structuredName: string | undefined, targetName: string): boolean {
  if (!structuredName) return false
  const a = norm(structuredName), b = norm(targetName)
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))
}

/**
 * The facts a page declares about the NAMED place (a block about another name, such as the site's organisation, is ignored). Each value must be plausible, or it is dropped:
 * address 8-300 characters; phone 8-13 digits; hours 5-200 characters with a time in them; price in VND between 1.000 and 50.000.000. Pure.
 */
export function officialFactsFromDoc(doc: Pick<PageDoc, 'structured'>, targetName: string): OfficialFactDraft[] {
  const block = doc.structured.find(s => nameMatches(s.name, targetName))
  if (!block) return []
  const out: OfficialFactDraft[] = []
  const address = block.address?.trim()
  if (address && address.length >= 8 && address.length <= 300 && /\p{L}/u.test(address)) out.push({ factType: 'address', value: { text: address } })
  const tel = block.telephone?.trim()
  const digits = tel ? tel.replace(/\D/g, '') : ''
  if (tel && digits.length >= 8 && digits.length <= 13) out.push({ factType: 'phone', value: { number: tel } })
  const hours = block.openingHours?.trim()
  if (hours && hours.length >= 5 && hours.length <= 200 && /\d{1,2}[:h]\d{0,2}/.test(hours)) out.push({ factType: 'opening_hours', value: { text: hours } })
  if (block.price && block.currency && block.currency.toUpperCase() === 'VND') {
    const amount = Number(block.price.replace(/[.,\s](?=\d{3}\b)/g, ''))
    if (Number.isInteger(amount) && amount >= 1_000 && amount <= 50_000_000) out.push({ factType: 'ticket_price', value: { amountVnd: amount } })
  }
  return out
}

export interface IngestCounts { fetched: boolean; facts: number; created: number; staged: number; unchanged: number; evidence: number; failed: number; reason?: string }

export interface IngestDeps {
  fetchPage: (url: string) => Promise<PageFetchResult>
  stage?: typeof stageFact
  attach?: typeof attachEvidence
}

/** One official page. Never throws; returns counts (and why nothing was written, when so). */
export async function ingestOfficialTarget(t: OfficialTarget, deps: IngestDeps, now: Date = new Date()): Promise<IngestCounts> {
  const c: IngestCounts = { fetched: false, facts: 0, created: 0, staged: 0, unchanged: 0, evidence: 0, failed: 0 }
  try {
    const stage = deps.stage ?? stageFact
    const attach = deps.attach ?? attachEvidence
    const r = await deps.fetchPage(t.url)
    if (!r.ok) return { ...c, reason: r.reason }
    c.fetched = true
    if (hostOf(new URL(r.finalUrl)) !== hostOf(new URL(t.url))) return { ...c, reason: 'host_changed' }
    const doc = extractPage(r.body, { url: r.finalUrl, contentType: r.contentType, structured: true })
    const facts = officialFactsFromDoc(doc, t.name)
    if (facts.length === 0) return { ...c, reason: 'no_facts' }
    c.facts = facts.length
    const domain = hostOf(new URL(t.url))
    for (const f of facts) {
      const res: StageResult = await stage({ entityType: 'attraction', entityKey: t.entityKey, canonicalName: t.name, city: t.city, factType: f.factType, value: f.value, valueUnit: f.factType === 'ticket_price' ? 'VND' : null, observedAt: now, retrievedAt: now, actor: INGEST_ACTOR })
      if (!res.ok) { c.failed++; continue }
      c[res.outcome]++
      if (res.outcome === 'unchanged') continue
      const ev = await attach({ versionId: res.versionId, sourceType: t.sourceType, domain, publisher: domain, reference: r.finalUrl, contentHash: contentHashOf({ factType: f.factType, value: f.value }), retrievedAt: now, policyVersion: FACT_TYPES[f.factType].policyId, relation: 'SUPPORTS', evaluator: 'ingest.official.v1' })
      if (ev.ok) c.evidence++
      else c.failed++
    }
  } catch {
    c.failed++
  }
  return c
}

export interface IngestRun { targets: number; skipped: number; totals: Omit<IngestCounts, 'reason' | 'fetched'> & { fetched: number }; reasons: Record<string, number> }

/** A bounded pass over the curated list, one page at a time. Never throws; logs counts only. */
export async function ingestOfficialTargets(targets: readonly OfficialTarget[], deps: IngestDeps, now: Date = new Date()): Promise<IngestRun> {
  const valid = targets.filter(isOfficialTarget)
  const run = valid.slice(0, INGEST_MAX_TARGETS)
  const out: IngestRun = { targets: run.length, skipped: targets.length - run.length, totals: { fetched: 0, facts: 0, created: 0, staged: 0, unchanged: 0, evidence: 0, failed: 0 }, reasons: {} }
  for (const t of run) {
    const c = await ingestOfficialTarget(t, deps, now)
    if (c.fetched) out.totals.fetched++
    for (const k of ['facts', 'created', 'staged', 'unchanged', 'evidence', 'failed'] as const) out.totals[k] += c[k]
    if (c.reason) out.reasons[c.reason] = (out.reasons[c.reason] ?? 0) + 1
  }
  console.log(JSON.stringify({ type: 'tappyai_tvi_ingest', ...out }))
  return out
}
