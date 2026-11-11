// The evidence card (Report Engine V2.1, M2; R13 §8 Evidence-Gated Dossier). Pure and deterministic: no model, no search.
// A card is one finding with what a later stage needs to trust it or drop it:
//   - the finding's EXACT words from the source (`quote`), checked HERE against the page text: a quote the page does not contain is UNVERIFIED and never goes to the analyst (it stays in the dossier);
//   - what it is about (the figure's subject, measure, scope, period, unit: consolidate.ts), where it comes from (the kind of source, the independence group: one publisher, or a copy of one page, counts once);
//   - how far to trust it: AUTHORITY PER KIND OF FACT (R13: never one tier for a domain). evidenceGate.ts has a table for PLACE facts (opening hours, address, ticket price) and none for a market figure, so a
//     research fact gets its own table below. Both tables are INITIAL POLICY, data in one place, for the owner to review.
// Not consumed by the writer yet (that is M3, the analyst); the engine only reports the cards.

import type { Evidence, Figure, Finding } from './deepResearch'
import { figureKey } from './consolidate'
import { FIGURE_CONFLICT_GAP } from './figureGap'
import { fold } from './researchSignals'

export type SourceKind = 'OFFICIAL' | 'COMPANY' | 'RESEARCH_FIRM' | 'PRESS' | 'REFERENCE' | 'AGGREGATOR' | 'SOCIAL' | 'OTHER'
export type FactFamily = 'regulation' | 'statistic' | 'company' | 'market_estimate' | 'survey' | 'price' | 'other'
export type Authority = 'HIGH' | 'MEDIUM' | 'LOW'
export type QuoteStatus = 'VERIFIED' | 'UNVERIFIED' | 'ABSENT'

// ── the source ────────────────────────────────────────────────────────────────────────────────────────────────────────

const SECOND_LEVEL = new Set(['com', 'gov', 'org', 'edu', 'net', 'co', 'ac'])

/** The registrable part of an address's host: www dropped, subdomains dropped ("static2.vietstock.vn" is "vietstock.vn", "ir.x.com.vn" is "x.com.vn"); "" when it is not an address. Pure. */
export function hostOf(url: string): string {
  let h = ''
  try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
  const parts = h.split('.')
  if (parts.length <= 2) return h
  const take = SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2
  return parts.slice(-take).join('.')
}

const hostIn = (host: string, list: readonly string[]) => list.some(d => host === d || host.endsWith(`.${d}`))
const OFFICIAL_HOSTS = ['chinhphu.vn', 'vbpl.vn', 'quochoi.vn', 'baochinhphu.vn', 'worldbank.org', 'imf.org', 'adb.org', 'oecd.org', 'un.org']
const PRESS_HOSTS = ['vnexpress.net', 'tuoitre.vn', 'thanhnien.vn', 'dantri.com.vn', 'vietnamnet.vn', 'cafef.vn', 'znews.vn', 'zingnews.vn', 'nld.com.vn', 'laodong.vn', 'tienphong.vn', 'vneconomy.vn', 'baodautu.vn', 'nhandan.vn', 'vietnamplus.vn', 'vov.vn', 'vtv.vn', 'kinhtedothi.vn', 'theinvestor.vn', 'vir.com.vn', 'vietnamnews.vn', 'reuters.com', 'bloomberg.com', 'ft.com', 'nikkei.com', 'scmp.com', 'bbc.com', 'cnbc.com', 'forbes.com', 'forbesvietnam.vn', 'vietnambiz.vn', 'nguoiquansat.vn', 'doanhnhansaigon.vn', 'cafebiz.vn', 'brandsvietnam.com', 'advertisingvietnam.com', 'vietstock.vn', 'kenh14.vn', 'afamily.vn', '24h.com.vn', 'baophapluat.vn', 'vnbusiness.vn', 'baogialai.com.vn', 'nhipcaudautu.vn', 'doanhnghieptiepthi.vn', 'kinhtetieudung.vn', 'kinhtedouong.vn']
const FIRM_HOSTS = ['ipos.vn', 'momentumworks.com', 'euromonitor.com', 'nielseniq.com', 'statista.com', 'imarcgroup.com', 'mordorintelligence.com', 'grandviewresearch.com', 'cimigo.com', 'qandme.net', 'decisionlab.co', 'kantar.com', 'mckinsey.com', 'bain.com', 'deloitte.com', 'pwc.com', 'kpmg.com', 'vcsc.com.vn', 'ssi.com.vn', 'mbs.com.vn', 'vndirect.com.vn', 'b-company.jp', 'kenresearch.com', '6wresearch.com', 'fortunebusinessinsights.com', 'industryarc.com', 'mobilityforesights.com', 'insightasia.com', 'vietdata.vn', 'metric.vn']
const REFERENCE_HOSTS = ['wikipedia.org', 'thuvienphapluat.vn', 'luatvietnam.vn']
const AGGREGATOR_HOSTS = ['studocu.vn', 'studocu.com', 'scribd.com', 'slideshare.net', 'medium.com', 'blogspot.com', 'wordpress.com', 'quora.com', 'validator.vn', 'baomoi.com', 'tripi.vn', 'lypham.vn', '123doc.net', 'tailieu.vn', 'vietnammm.com', 'rssing.com']
const SOCIAL_HOSTS = ['facebook.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'instagram.com', 'reddit.com', 'x.com', 'twitter.com', 'threads.net', 'zalo.me', 'pinterest.com']

/**
 * What kind of source an address is. `site`: the real site a search row names when its link is a Google redirect. COMPANY is only the company's own investor pages (an "ir." or "investor." host, or an
 * annual-report path): which company a page is about cannot be told from its address. Initial policy. Pure.
 */
export function classifySource(url: string, site?: string): SourceKind {
  let host = hostOf(url)
  if (/(^|\.)google\./.test(host) && site) host = hostOf(`https://${site}`) || host
  if (!host) return 'OTHER'
  let raw = ''
  try { raw = new URL(url).hostname.toLowerCase() } catch { raw = '' }
  if (host.endsWith('.gov.vn') || hostIn(host, OFFICIAL_HOSTS)) return 'OFFICIAL'
  if (/^(ir|investor|investors)\./.test(raw) || /(annual-?report|bao-cao-thuong-nien|\/investor)/i.test(url)) return 'COMPANY'
  if (hostIn(host, FIRM_HOSTS)) return 'RESEARCH_FIRM'
  if (hostIn(host, PRESS_HOSTS)) return 'PRESS'
  if (hostIn(host, REFERENCE_HOSTS)) return 'REFERENCE'
  if (hostIn(host, AGGREGATOR_HOSTS)) return 'AGGREGATOR'
  if (hostIn(host, SOCIAL_HOSTS)) return 'SOCIAL'
  return 'OTHER'
}

// ── authority per kind of fact ────────────────────────────────────────────────────────────────────────────────────────

/** What a figure is, read from what it measures (initial policy; keywords on the folded text). */
export function factFamily(f: Figure | undefined): FactFamily {
  if (!f) return 'other'
  const s = fold(`${f.series} ${f.label} ${f.subject ?? ''} ${f.scope ?? ''}`)
  if (/(thue|luat|nghi dinh|thong tu|nghi quyet|quy dinh|muc phat)/.test(s)) return 'regulation'
  if (/(khao sat|dieu tra|dap vien|ty le (nguoi|khach|chi|uong|su dung|chon))/.test(s)) return 'survey'
  if (/(gdp|cpi|lam phat|dan so|thu nhap|ban le)/.test(s)) return 'statistic'
  if (/(quy mo|thi truong|cagr|tang truong)/.test(s) && !(f.subject ?? '').trim()) return 'market_estimate'
  if (/(doanh thu|loi nhuan|cua hang|diem ban)/.test(s)) return 'company'
  if (/(gia ban|gia trung binh|dong\/ly|muc gia|gia ve)/.test(s)) return 'price'
  if (/(quy mo|thi truong|cagr|tang truong)/.test(s)) return 'market_estimate'
  return 'other'
}

const AUTH: Record<FactFamily, Partial<Record<SourceKind, Authority>>> = {
  regulation: { OFFICIAL: 'HIGH', REFERENCE: 'MEDIUM', PRESS: 'MEDIUM' },
  statistic: { OFFICIAL: 'HIGH', RESEARCH_FIRM: 'MEDIUM', PRESS: 'MEDIUM', COMPANY: 'MEDIUM' },
  company: { COMPANY: 'HIGH', OFFICIAL: 'HIGH', PRESS: 'MEDIUM', RESEARCH_FIRM: 'MEDIUM' },
  market_estimate: { OFFICIAL: 'HIGH', RESEARCH_FIRM: 'MEDIUM', PRESS: 'MEDIUM' },
  survey: { RESEARCH_FIRM: 'HIGH', OFFICIAL: 'HIGH', PRESS: 'MEDIUM' },
  price: { COMPANY: 'HIGH', PRESS: 'MEDIUM' },
  other: { OFFICIAL: 'HIGH', RESEARCH_FIRM: 'MEDIUM', PRESS: 'MEDIUM', COMPANY: 'MEDIUM' },
}
/** Who may speak for which kind of fact. A kind not listed (an aggregator, a social post, an unknown site) is LOW for every family. */
export const authorityFor = (family: FactFamily, kind: SourceKind): Authority => AUTH[family][kind] ?? 'LOW'

// ── the quote ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Folded text with every kind of dash, quote mark and run of spaces made plain, so spelling, case, diacritics and typography do not decide. */
const plain = (s: string): string => fold(s).replace(/[‐‑‒–—―−]/g, '-').replace(/[“”„«»"']/g, '"').replace(/\s+/g, ' ').trim()
const MIN_PIECE = 15

/**
 * Whether the quote is on the page. "…" (or "...") skips words: every piece of at least 15 characters must be found, in that order. A quote with no such piece, or an empty one, proves nothing. Pure.
 */
export function quoteInText(quote: string, text: string): boolean {
  const pieces = String(quote ?? '').split(/…|\.{3}/).map(plain).filter(Boolean)
  if (!pieces.length || pieces.some(p => p.length < MIN_PIECE)) return false
  const page = plain(text)
  let from = 0
  for (const p of pieces) { const at = page.indexOf(p, from); if (at < 0) return false; from = at + p.length }
  return true
}

// ── the card ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EvidenceCard {
  id: string
  step: number
  source: number
  text: string
  quote?: string
  quoteStatus: QuoteStatus
  figure?: Figure
  /** the figure's own number is written inside the verified quote */
  figureInQuote: boolean
  sourceKind: SourceKind
  host: string
  published?: string
  family: FactFamily
  authority: Authority
  /** one publisher, or copies of one page, count once */
  independenceGroup: string
  score: number
  confidence: Authority
}

type WithQuote = Finding & { quote?: string }
const fingerprint = (text: string): string | null => { const t = fold(text).replace(/[^a-z0-9 ]/g, '').slice(0, 200); return t.length >= 80 ? t : null }
const RANK: Record<Authority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }

/**
 * One card per finding. `numberIn(value, text)` says whether a number is written in a text (deepResearch's numberInText, passed in so this file does not import the engine). Confidence: authority (3, 2, 1) +
 * 1 for a verified quote + 1 for the figure's number inside it; HIGH from 5, MEDIUM from 3, else LOW, and a LOW-authority source never rises above LOW. Pure.
 */
export function buildCards(findings: readonly WithQuote[], evidence: readonly Evidence[], numberIn: (value: number, text: string) => boolean): EvidenceCard[] {
  const byId = new Map(evidence.map(e => [e.id, e]))
  const hostGroup = new Map<string, string>()
  const fpGroup = new Map<string, string>()
  const groupOf = new Map<number, string>()
  for (const e of [...evidence].sort((a, b) => a.id - b.id)) {
    const host = hostOf(e.url) || `source-${e.id}`
    const fp = fingerprint(e.text)
    const g = hostGroup.get(host) ?? (fp ? fpGroup.get(fp) : undefined) ?? host
    hostGroup.set(host, g)
    if (fp && !fpGroup.has(fp)) fpGroup.set(fp, g)
    groupOf.set(e.id, g)
  }
  return findings.map((f, i): EvidenceCard => {
    const e = byId.get(f.source)
    const pageText = e ? `${e.title}\n${e.snippet}\n${e.text}` : ''
    const quote = typeof f.quote === 'string' && f.quote.trim() ? f.quote.trim() : undefined
    const quoteStatus: QuoteStatus = !quote ? 'ABSENT' : e && quoteInText(quote, pageText) ? 'VERIFIED' : 'UNVERIFIED'
    const figureInQuote = !!(quote && quoteStatus === 'VERIFIED' && f.figure && numberIn(f.figure.value, quote))
    const sourceKind = e ? classifySource(e.url, e.site) : 'OTHER'
    const family = factFamily(f.figure)
    const authority = authorityFor(family, sourceKind)
    const score = RANK[authority] + (quoteStatus === 'VERIFIED' ? 1 : 0) + (figureInQuote ? 1 : 0)
    const confidence: Authority = authority === 'LOW' ? 'LOW' : score >= 5 ? 'HIGH' : score >= 3 ? 'MEDIUM' : 'LOW'
    return {
      id: `C${i + 1}`, step: f.step, source: f.source, text: f.text, ...(quote ? { quote } : {}), quoteStatus, ...(f.figure ? { figure: f.figure } : {}), figureInQuote,
      sourceKind, host: e ? hostOf(e.url) : '', ...(e?.published ? { published: e.published } : {}), family, authority,
      independenceGroup: groupOf.get(f.source) ?? `source-${f.source}`, score, confidence,
    }
  })
}

export interface FactSupport { key: string; status: 'STRONG' | 'SINGLE' | 'CONFLICT'; values: Array<{ value: number; groups: number; cards: string[] }> }

/**
 * Per fact (same subject, measure, unit, scope and period): STRONG when one value is held by two or more independent groups, CONFLICT when values further apart than rounding are held by two or more
 * independent groups, SINGLE otherwise (one group, however many times it repeats itself). A card with no figure is no fact. Pure.
 */
export function factSupport(cards: readonly EvidenceCard[]): FactSupport[] {
  const byKey = new Map<string, Array<{ value: number; group: string; id: string }>>()
  for (const c of cards) {
    const k = c.figure ? figureKey({ step: c.step, source: c.source, text: c.text, figure: c.figure }) : null
    if (k) byKey.set(k.key, [...(byKey.get(k.key) ?? []), { value: k.value, group: c.independenceGroup, id: c.id }])
  }
  const out: FactSupport[] = []
  for (const [key, items] of byKey) {
    const values = new Map<number, { groups: Set<string>; cards: string[] }>()
    for (const it of items) { const v = values.get(it.value) ?? { groups: new Set<string>(), cards: [] }; v.groups.add(it.group); v.cards.push(it.id); values.set(it.value, v) }
    const list = [...values.entries()].map(([value, v]) => ({ value, groups: v.groups.size, cards: v.cards })).sort((a, b) => b.groups - a.groups || a.value - b.value)
    const all = list.map(v => v.value)
    const lo = Math.min(...all), hi = Math.max(...all)
    const apart = hi - lo > Math.abs(hi) * FIGURE_CONFLICT_GAP
    const groupsAll = new Set(items.map(i => i.group)).size
    const status = apart && groupsAll >= 2 ? 'CONFLICT' : list.some(v => v.groups >= 2) || (!apart && groupsAll >= 2) ? 'STRONG' : 'SINGLE'
    out.push({ key, status, values: list })
  }
  return out
}

/** The cards the analyst may read: every card whose quote is not refuted (VERIFIED, or no quote), best confidence first, then score, then order; at most `limit`. UNVERIFIED cards stay in the dossier. Pure. */
export function forAnalyst(cards: readonly EvidenceCard[], limit = 100): EvidenceCard[] {
  return cards.filter(c => c.quoteStatus !== 'UNVERIFIED')
    .sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || b.score - a.score || Number(a.id.slice(1)) - Number(b.id.slice(1)))
    .slice(0, limit)
}

export interface CardSummary {
  total: number
  quote: { verified: number; unverified: number; absent: number }
  byKind: Partial<Record<SourceKind, number>>
  byConfidence: Record<Authority, number>
  forAnalyst: number
  facts: { strong: number; single: number; conflict: number }
}

/** Counts only, never text: for the log and the measurement. Pure. */
export function cardSummary(cards: readonly EvidenceCard[]): CardSummary {
  const byKind: Partial<Record<SourceKind, number>> = {}
  for (const c of cards) byKind[c.sourceKind] = (byKind[c.sourceKind] ?? 0) + 1
  const facts = factSupport(cards)
  return {
    total: cards.length,
    quote: { verified: cards.filter(c => c.quoteStatus === 'VERIFIED').length, unverified: cards.filter(c => c.quoteStatus === 'UNVERIFIED').length, absent: cards.filter(c => c.quoteStatus === 'ABSENT').length },
    byKind,
    byConfidence: { HIGH: cards.filter(c => c.confidence === 'HIGH').length, MEDIUM: cards.filter(c => c.confidence === 'MEDIUM').length, LOW: cards.filter(c => c.confidence === 'LOW').length },
    forAnalyst: cards.filter(c => c.quoteStatus !== 'UNVERIFIED').length,
    facts: { strong: facts.filter(f => f.status === 'STRONG').length, single: facts.filter(f => f.status === 'SINGLE').length, conflict: facts.filter(f => f.status === 'CONFLICT').length },
  }
}
