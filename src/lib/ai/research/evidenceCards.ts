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
import { ratioMismatch, resolveVintages, whenOf, type VintageItem } from './evidenceState'

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
// 15/11 (the chip report: 354 of 441 cards were "OTHER" and so LOW, because this list was written for a Vietnamese consumer report: WSTS, SIA, SEC, the company's own newsroom, McKinsey, Gartner and
// TSMC's pages were all "unknown", and the analyst, who reads the best 90 cards, never met the newest figures). Authority is now read from WHAT the publisher is - a government, an intergovernmental
// or industry statistics body, a company speaking about itself, a research firm, the press - in this order: the shape of the address first (a government or intergovernmental suffix, an investor or
// newsroom page of a company), then these tables of the publishers whose nature is known world-wide. An address that is none of these stays OTHER (LOW): nothing is guessed.
const OFFICIAL_HOSTS = ['chinhphu.vn', 'vbpl.vn', 'quochoi.vn', 'baochinhphu.vn', 'worldbank.org', 'imf.org', 'adb.org', 'oecd.org', 'un.org',
  // statistics and industry bodies that are the origin of the sector's own numbers
  'wsts.org', 'semiconductors.org', 'semi.org', 'iea.org', 'bis.org', 'wto.org', 'unctad.org', 'ilo.org', 'iata.org', 'unwto.org', 'eurostat.eu', 'ecb.europa.eu', 'sec.gov']
/** A government, a regulator or an intergovernmental body by the SHAPE of its address (".gov", ".gov.xx", ".go.jp", ".gouv.fr", ".gob.es", ".europa.eu", ".int"). */
const OFFICIAL_SHAPE = /(^|\.)(gov|gouv|gob)\.[a-z]{2,3}$|(^|\.)go\.[a-z]{2}$|\.gov$|\.mil$|\.europa\.eu$|\.int$/
/** A company's own investor or newsroom page by the shape of its address: "ir.x.com", "investor.x.com", "newsroom.x.com", "press.x.com", and "xnews.x.com" for company x. */
function isCompanyVoice(rawHost: string, url: string, host: string): boolean {
  const labels = rawHost.replace(/^www\./, '').split('.')
  if (labels.length >= 3 && /^(ir|investor|investors|newsroom|press|pr|corporate)$/.test(labels[0])) return true
  if (labels.length >= 3 && labels[0].length > 4 && labels[0].endsWith('news') && labels[0].slice(0, -4) === labels[1]) return true
  // a "newsroom" or "press release" PATH is the company's own voice only on a site that is not itself a research firm, a statistics body or the press (Gartner's newsroom is Gartner the analyst, not a company)
  if (hostIn(host, FIRM_HOSTS) || hostIn(host, OFFICIAL_HOSTS) || hostIn(host, PRESS_HOSTS)) return /(annual-?report|bao-cao-thuong-nien)/i.test(url)
  return /(annual-?report|bao-cao-thuong-nien|\/investors?(\/|$)|\/newsroom(\/|$)|\/press-?releases?(\/|$))/i.test(url)
}
const PRESS_HOSTS = ['vnexpress.net', 'tuoitre.vn', 'thanhnien.vn', 'dantri.com.vn', 'vietnamnet.vn', 'cafef.vn', 'znews.vn', 'zingnews.vn', 'nld.com.vn', 'laodong.vn', 'tienphong.vn', 'vneconomy.vn', 'baodautu.vn', 'nhandan.vn', 'vietnamplus.vn', 'vov.vn', 'vtv.vn', 'kinhtedothi.vn', 'theinvestor.vn', 'vir.com.vn', 'vietnamnews.vn', 'reuters.com', 'bloomberg.com', 'ft.com', 'nikkei.com', 'scmp.com', 'bbc.com', 'cnbc.com', 'forbes.com', 'wsj.com', 'nytimes.com', 'apnews.com', 'theguardian.com', 'washingtonpost.com', 'economist.com', 'cnn.com', 'nbcnews.com', 'pbs.org', 'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com', 'koreatimes.co.kr', 'koreaherald.com', 'straitstimes.com', 'yahoo.com', 'marketwatch.com', 'investing.com', 'cbsnews.com', 'businessinsider.com', 'seekingalpha.com', 'techpowerup.com', 'tomshardware.com', 'theregister.com', 'digitimes.com', 'taipeitimes.com', 'focustaiwan.tw', 'yna.co.kr', 'forbesvietnam.vn', 'vietnambiz.vn', 'nguoiquansat.vn', 'doanhnhansaigon.vn', 'cafebiz.vn', 'brandsvietnam.com', 'advertisingvietnam.com', 'vietstock.vn', 'kenh14.vn', 'afamily.vn', '24h.com.vn', 'baophapluat.vn', 'vnbusiness.vn', 'baogialai.com.vn', 'nhipcaudautu.vn', 'doanhnghieptiepthi.vn', 'kinhtetieudung.vn', 'kinhtedouong.vn', 'vietnam.vn', 'vcci.com.vn', 'tapchikinhtetaichinh.vn', 'nhadautu.vn', 'danviet.vn', 'vietnamfinance.vn', 'markettimes.vn', 'kinhtechungkhoan.vn', 'thanhtra.com.vn', 'congly.vn']
const COMPANY_HOSTS = ['masangroup.com', 'masanconsumer.com', 'momo.vn', 'zalopay.vn']
const FIRM_HOSTS = ['ipos.vn', 'momentumworks.com', 'euromonitor.com', 'nielseniq.com', 'statista.com', 'imarcgroup.com', 'mordorintelligence.com', 'grandviewresearch.com', 'cimigo.com', 'qandme.net', 'decisionlab.co', 'kantar.com', 'mckinsey.com', 'bain.com', 'bcg.com', 'ey.com', 'accenture.com', 'gartner.com', 'idc.com', 'trendforce.com', 'counterpointresearch.com', 'canalys.com', 'forrester.com', 'goldmansachs.com', 'morganstanley.com', 'jpmorgan.com', 'ipsos.com', 'gfk.com', 'mintel.com', 'cbre.com', 'jll.com', 'colliers.com', 'savills.com', 'knightfrank.com', 'pewresearch.org', 'cfr.org', 'whitecase.com', 'ourworldindata.org', 'semianalysis.com', 'yolegroup.com', 'techinsights.com', 'deloitte.com', 'pwc.com', 'kpmg.com', 'vcsc.com.vn', 'ssi.com.vn', 'mbs.com.vn', 'vndirect.com.vn', 'b-company.jp', 'kenresearch.com', '6wresearch.com', 'fortunebusinessinsights.com', 'industryarc.com', 'mobilityforesights.com', 'insightasia.com', 'vietdata.vn', 'metric.vn', 'vda.org.vn', 'vietnam-briefing.com']
const REFERENCE_HOSTS = ['wikipedia.org', 'thuvienphapluat.vn', 'luatvietnam.vn', 'dulieuphapluat.vn']
const AGGREGATOR_HOSTS = ['studocu.vn', 'studocu.com', 'scribd.com', 'slideshare.net', 'medium.com', 'blogspot.com', 'wordpress.com', 'quora.com', 'validator.vn', 'baomoi.com', 'tripi.vn', 'lypham.vn', '123doc.net', 'tailieu.vn', 'vietnammm.com', 'rssing.com', 'posapp.vn', 'banhmimahai.vn', 'einvoice.vn', 'vinalink.vn', 'mqflavor.com', 'unitedvision.com.vn', 'phuctea.com.vn', 'khonguyenlieu.net', 'airwallex.com']
const SOCIAL_HOSTS = ['linkedin.com', 'facebook.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'instagram.com', 'reddit.com', 'x.com', 'twitter.com', 'threads.net', 'zalo.me', 'pinterest.com']

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
  if (host.endsWith('.gov.vn') || OFFICIAL_SHAPE.test(raw) || hostIn(host, OFFICIAL_HOSTS)) return 'OFFICIAL'
  if (isCompanyVoice(raw, url, host) || hostIn(host, COMPANY_HOSTS)) return 'COMPANY'
  if (hostIn(host, FIRM_HOSTS)) return 'RESEARCH_FIRM'
  if (hostIn(host, PRESS_HOSTS)) return 'PRESS'
  if (hostIn(host, REFERENCE_HOSTS)) return 'REFERENCE'
  if (hostIn(host, AGGREGATOR_HOSTS)) return 'AGGREGATOR'
  if (hostIn(host, SOCIAL_HOSTS)) return 'SOCIAL'
  // what the suffix says: an association (.org.vn) publishes data like a research firm; a school or university (.edu.vn) is a reference
  if (host.endsWith('.org.vn')) return 'RESEARCH_FIRM'
  if (host.endsWith('.edu.vn') || /\.edu(\.[a-z]{2})?$|\.ac\.[a-z]{2}$/.test(raw)) return 'REFERENCE'
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
  if (/(quy mo|thi truong|cagr|tang truong|du bao)/.test(s) && !(f.subject ?? '').trim()) return 'market_estimate'
  // a sector's own sales, output or trade series with no company named is a statistic (the body that counts it is the authority), not one company's revenue
  if (/(doanh so|san luong|xuat khau|nhap khau)/.test(s) && !(f.subject ?? '').trim()) return 'statistic'
  if (/(doanh thu|loi nhuan|cua hang|diem ban)/.test(s)) return 'company'
  if (/(gia ban|gia trung binh|dong\/ly|muc gia|gia ve)/.test(s)) return 'price'
  if (/(quy mo|thi truong|cagr|tang truong|du bao)/.test(s)) return 'market_estimate'
  return 'other'
}

const AUTH: Record<FactFamily, Partial<Record<SourceKind, Authority>>> = {
  regulation: { OFFICIAL: 'HIGH', REFERENCE: 'MEDIUM', PRESS: 'MEDIUM' },
  statistic: { OFFICIAL: 'HIGH', RESEARCH_FIRM: 'MEDIUM', PRESS: 'MEDIUM', COMPANY: 'MEDIUM' },
  company: { COMPANY: 'HIGH', OFFICIAL: 'HIGH', PRESS: 'MEDIUM', RESEARCH_FIRM: 'MEDIUM' },
  market_estimate: { OFFICIAL: 'HIGH', RESEARCH_FIRM: 'MEDIUM', PRESS: 'MEDIUM', COMPANY: 'MEDIUM' },
  survey: { RESEARCH_FIRM: 'HIGH', OFFICIAL: 'HIGH', PRESS: 'MEDIUM' },
  price: { COMPANY: 'HIGH', PRESS: 'MEDIUM' },
  other: { OFFICIAL: 'HIGH', RESEARCH_FIRM: 'MEDIUM', PRESS: 'MEDIUM', COMPANY: 'MEDIUM' },
}
/** Who may speak for which kind of fact. A kind not listed (an aggregator, a social post, an unknown site) is LOW for every family. */
export const authorityFor = (family: FactFamily, kind: SourceKind): Authority => AUTH[family][kind] ?? 'LOW'

// ── the quote ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Only the letters and digits, folded (no diacritics, lower case): spelling, case, punctuation, table bars, line breaks and stray spaces do not decide, the words and the numbers do. Measured 11/11 (M2, 1821
 * cards): 124 quotes were refused when the comparison also looked at punctuation and spacing, and the ones looked at were real (a table row "Bia các loại | 65% | 90%", " ." for ".", "5g/100ml" for "5 g / 100 ml").
 */
const squash = (s: string): string => fold(s).replace(/[^a-z0-9]/g, '')
const MIN_PIECE = 10

/**
 * Whether the quote is on the page. "…" (or "...") skips words: every piece, with at least 10 letters and digits, must be found, in that order. A quote with a shorter piece, or an empty one, proves nothing.
 * A different number is a different quote. Pure.
 */
export function quoteInText(quote: string, text: string): boolean {
  const pieces = String(quote ?? '').split(/…|\.{3}/).map(squash).filter(Boolean)
  if (!pieces.length || pieces.some(p => p.length < MIN_PIECE)) return false
  const page = squash(text)
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
  /** when the source STATED this figure (the figure's own "stated" date, else the page's date), as the source wrote it; absent when neither is known */
  vintage?: string
  /** the id of a newer card from an equally or more authoritative source that states the same fact with another value: this card is out of date and does not go to the analyst or the forecast */
  supersededBy?: string
  /** the code's own arithmetic found that the text contradicts itself (evidenceState.ratioMismatch); the card is LOW and the analyst is told the computed share */
  ratioNote?: string
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
  const cards = findings.map((f, i): EvidenceCard => {
    const e = byId.get(f.source)
    const pageText = e ? `${e.title}\n${e.snippet}\n${e.text}` : ''
    const quote = typeof f.quote === 'string' && f.quote.trim() ? f.quote.trim() : undefined
    const quoteStatus: QuoteStatus = !quote ? 'ABSENT' : e && quoteInText(quote, pageText) ? 'VERIFIED' : 'UNVERIFIED'
    const figureInQuote = !!(quote && quoteStatus === 'VERIFIED' && f.figure && numberIn(f.figure.value, quote))
    const sourceKind = e ? classifySource(e.url, e.site) : 'OTHER'
    const family = factFamily(f.figure)
    const authority = authorityFor(family, sourceKind)
    const score = RANK[authority] + (quoteStatus === 'VERIFIED' ? 1 : 0) + (figureInQuote ? 1 : 0)
    const ratio = ratioMismatch(f.text)
    const confidence: Authority = authority === 'LOW' || ratio ? 'LOW' : score >= 5 ? 'HIGH' : score >= 3 ? 'MEDIUM' : 'LOW'
    const vintage = (f.figure?.stated && whenOf(f.figure.stated) !== null ? f.figure.stated : undefined) ?? (e?.published && whenOf(e.published) !== null ? e.published : undefined)
    return {
      id: `C${i + 1}`, step: f.step, source: f.source, text: f.text, ...(quote ? { quote } : {}), quoteStatus, ...(f.figure ? { figure: f.figure } : {}), figureInQuote,
      sourceKind, host: e ? hostOf(e.url) : '', ...(e?.published ? { published: e.published } : {}), family, authority,
      independenceGroup: groupOf.get(f.source) ?? `source-${f.source}`, score, confidence,
      ...(vintage ? { vintage } : {}), ...(ratio ? { ratioNote: ratio.note } : {}),
    }
  })
  // one state for every later reader: a figure that a newer, equally authoritative statement of the same fact replaces is marked, and the analyst and the forecast model both skip it
  const items: VintageItem[] = []
  for (const c of cards) {
    const k = c.figure ? figureKey({ step: c.step, source: c.source, text: c.text, figure: c.figure }) : null
    if (k) items.push({ id: c.id, key: k.key, value: k.value, when: whenOf(c.vintage), rank: RANK[c.authority] })
  }
  const replaced = resolveVintages(items, FIGURE_CONFLICT_GAP)
  return cards.map(c => (replaced.has(c.id) ? { ...c, supersededBy: replaced.get(c.id) } : c))
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
export function forAnalyst(cards: readonly EvidenceCard[], limit = 100, nowMs: number = Date.now()): EvidenceCard[] {
  return pickForAnalyst(cards, limit, nowMs)
}

/** A quarter of the analyst's places go to the NEWEST dated cards (stated within this many days), so a fresh figure from a lesser-ranked source is not crowded out by older, better-ranked ones. */
export const RECENT_DAYS = 120
export const RECENT_SHARE = 0.25

/** Two fifths of the places are shared out by research step (one step = one part of the question), so a part the question asks for is never crowded out by a bigger one (the chip run: the hot-news step's cards
 *  were in the pool, MEDIUM, and the report still left out the day's biggest event, because the analyst's 90 places went to the steps with the most cards). */
export const STEP_SHARE = 0.4

/**
 * The cards the analyst reads: not refuted (quote VERIFIED or absent), not replaced by a newer statement of the same fact. Three tiers, each in the order best confidence, score, newer statement, order:
 * (1) every step gets its best cards, two fifths of the places in all; (2) a quarter go to the newest dated cards; (3) the rest to the best of what is left. At most `limit`, shown best first. Pure.
 */
export function pickForAnalyst(cards: readonly EvidenceCard[], limit: number, nowMs: number): EvidenceCard[] {
  const when = (c: EvidenceCard) => whenOf(c.vintage)
  const eligible = cards.filter(c => c.quoteStatus !== 'UNVERIFIED' && !c.supersededBy)
  const ranked = [...eligible].sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || b.score - a.score || (when(b) ?? -Infinity) - (when(a) ?? -Infinity) || Number(a.id.slice(1)) - Number(b.id.slice(1)))
  if (ranked.length <= limit) return ranked
  const taken = new Set<string>()
  // 1. each step's best cards
  const steps = [...new Set(ranked.map(c => c.step))]
  const perStep = Math.max(1, Math.floor((limit * STEP_SHARE) / steps.length))
  for (const s of steps) {
    let n = 0
    for (const c of ranked) { if (c.step === s && n < perStep && taken.size < Math.floor(limit * STEP_SHARE)) { taken.add(c.id); n++ } }
  }
  // 2. the newest dated cards
  const reserve = Math.floor(limit * RECENT_SHARE)
  ranked.filter(c => !taken.has(c.id) && (when(c) ?? -Infinity) >= nowMs - RECENT_DAYS * 86_400_000)
    .sort((a, b) => (when(b) as number) - (when(a) as number) || RANK[b.confidence] - RANK[a.confidence]).slice(0, reserve).forEach(c => taken.add(c.id))
  // 3. the best of the rest
  for (const c of ranked) { if (taken.size >= limit) break; taken.add(c.id) }
  return ranked.filter(c => taken.has(c.id))
}

export interface CardSummary {
  total: number
  quote: { verified: number; unverified: number; absent: number }
  byKind: Partial<Record<SourceKind, number>>
  byConfidence: Record<Authority, number>
  forAnalyst: number
  /** cards a newer statement of the same fact replaced / cards whose own arithmetic failed / cards with a known date */
  superseded: number
  ratioFlagged: number
  dated: number
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
    forAnalyst: cards.filter(c => c.quoteStatus !== 'UNVERIFIED' && !c.supersededBy).length,
    superseded: cards.filter(c => c.supersededBy).length,
    ratioFlagged: cards.filter(c => c.ratioNote).length,
    dated: cards.filter(c => c.vintage).length,
    facts: { strong: facts.filter(f => f.status === 'STRONG').length, single: facts.filter(f => f.status === 'SINGLE').length, conflict: facts.filter(f => f.status === 'CONFLICT').length },
  }
}
