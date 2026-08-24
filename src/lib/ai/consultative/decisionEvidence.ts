import type { Candidate } from './candidate'
import type { Pick } from './pick'
import { normalizeVN } from '../intent'

// ── The authoritative shopping decision evidence ────────────────────────────
//
// Production UAT on 7deee03 measured, over five runs of one query, five separate
// fabrications that no prompt rule prevented:
//
//   · "các cấu hình 32GB/512GB chính hãng" — for a listing whose record carries
//     NO `ram_gb`, NO `storage_gb` and NO `spec_source` at all;
//   · "chính hãng" / "bảo hành chính hãng" / "đại lý chính thức" read off the
//     seller name and the domain;
//   · an M1 Pro listing offered as the requested M1;
//   · on the follow-up turn — "khoảng 28-29 triệu" against an actual 24,490,000,
//     and "Google Maps 4.8⭐" against a product rating of 4.7.
//
// The follow-up cases are the tell. That turn makes NO tool call, and the tool
// result is not a message a client may send back (`clientInput` allows only
// `user` and `assistant`), so the evidence table was simply absent and the model
// was answering from its own prose. Fabrication there is not a model defect; it
// is the only thing that CAN happen when the facts have been deleted.
//
// So this module builds the facts ONCE, from server-side data, and they are
// carried — never recomputed, never restated from memory.
//
// ============================================================================
// THE ONE RULE
// ============================================================================
// A field is either a value taken from THIS listing's own record, or it is the
// explicit UNKNOWN marker. There is no third state, and absence is never encoded
// by leaving a key out: an omitted key reads as silence, and silence is exactly
// what the model filled in with "32GB/512GB".
//
// 🚨 UNKNOWN is not `false` and not `0`. A missing RAM figure does not mean the
// machine has no RAM; a missing condition does not mean the machine is not
// genuine. It means NOBODY SAID, and the reply may not resolve that either way.

/** The marker the model sees where evidence does not exist. */
export const UNKNOWN = 'KHONG CO DU LIEU'
export type Unknown = typeof UNKNOWN

/** A value the evidence establishes, or the explicit absence of one. */
export type Known<T> = T | Unknown

/**
 * An attribute that exists only because THIS listing's own title states it.
 *
 * `evidence` is carried so the claim can be traced back. It is `'title'` and
 * nothing else on purpose: seller name, domain, reputation, price and brand are
 * not evidence sources, and giving them a spelling here would invite exactly the
 * inference the production failures were made of.
 */
export interface TitleAttribute {
  value: string
  evidence: 'title'
}

export interface ListingEvidence {
  listingId: string
  title: string
  source: Known<string>
  priceVnd: Known<number>
  rating: Known<number>
  reviewCount: Known<number>
  ramGb: Known<number>
  storageGb: Known<number>
  chip: TitleAttribute | Unknown
  condition: TitleAttribute | Unknown
  /**
   * Always UNKNOWN, and deliberately PRESENT rather than omitted.
   *
   * `/shopping` has no warranty field, so no listing can ever establish one —
   * yet production twice asserted "bảo hành đầy đủ" / "bảo hành chính hãng" off
   * the seller's name. A key that is always UNKNOWN says "this was considered
   * and there is nothing"; a missing key says nothing at all.
   */
  warranty: Unknown
  link: Known<string>
}

/** What the user actually asked for, parsed from their own words. */
export interface RequestedConfig {
  chip: Known<string>
  ramGb: Known<number>
  storageGb: Known<number>
}

export type ConfigMatch = 'exact' | 'mismatch' | 'unknown'

export interface DecisionEvidence {
  /** Schema version — a stored row outlives the code that wrote it. */
  v: 1
  pick: ListingEvidence
  decidedBy: { attribute: string; evidence: string }[]
  runnerUp: { listing: ListingEvidence; leadsOn: { attribute: string; evidence: string } | null } | null
  rejected: { listingId: string; title: string; source: Known<string>; priceVnd: Known<number>; priceDeltaVsPickVnd: Known<number> }[]
  totalFound: number | null
  conditional: boolean
  unverified: string[]
  requested: RequestedConfig
  configMatch: ConfigMatch
  sayableFacts: string[]
}

// ── Deterministic extraction from a listing's OWN title ─────────────────────
//
// These deliberately do not import the detectors in `claimScope`. Those are
// test-only analysis helpers with their own sentence-splitting behaviour (which
// production text already broke once, on decimal prices and dotted domains).
// Production grounding must not depend on a test helper, and a title is not a
// sentence — it is parsed whole, so no splitting is involved here at all.

/** The chip a title STATES, at full precision. `m1 pro` is never `m1`. */
export function chipFromTitle(title: string): TitleAttribute | Unknown {
  const t = normalizeVN(title.toLowerCase())
  // Longest first: "m1 pro max" must beat "m1 pro", which must beat "m1".
  const m = t.match(/\bm(\d)\s*(pro max|max|pro|ultra)\b/) || t.match(/\bm(\d)\b/)
  if (!m) return UNKNOWN
  return { value: m[2] ? `M${m[1]} ${m[2].replace(/\b\w/g, c => c.toUpperCase())}` : `M${m[1]}`, evidence: 'title' }
}

/**
 * The condition/provenance a title STATES.
 *
 * The vocabulary is wider than the one #172 shipped because production produced
 * claims outside it — "chính thức" and "đại lý chính thức" were both asserted
 * from a domain, and "99%" is how a Vietnamese listing writes near-new.
 */
const CONDITION_TERMS: { re: RegExp; label: string }[] = [
  { re: /\bdai ly chinh thuc\b/, label: 'Đại lý chính thức' },
  { re: /\bbao hanh chinh hang\b/, label: 'Bảo hành chính hãng' },
  { re: /\bchinh hang\b/, label: 'Chính hãng' },
  { re: /\bchinh thuc\b/, label: 'Chính thức' },
  { re: /\b(likenew|like new|like-new)\b/, label: 'Like new' },
  { re: /\b(refurbished|refurb)\b/, label: 'Refurbished' },
  { re: /\b(sealed|nguyen seal)\b/, label: 'Sealed' },
  { re: /\b99\s*%/, label: '99%' },
  { re: /\bcu\b(?!\s+the\b)/, label: 'Cũ' },
]

export function conditionFromTitle(title: string): TitleAttribute | Unknown {
  const t = normalizeVN(title.toLowerCase())
  for (const c of CONDITION_TERMS) if (c.re.test(t)) return { value: c.label, evidence: 'title' }
  return UNKNOWN
}

/** Capacities a title states, as `{ramGb, storageGb}` — the SMALLER is RAM. */
function capacitiesFromTitle(title: string): { ramGb: Known<number>; storageGb: Known<number> } {
  const t = normalizeVN(title.toLowerCase())
  const gb = [...t.matchAll(/\b(\d+)\s*(gb|g|tb)\b/g)]
    .map(m => (m[2] === 'tb' ? Number(m[1]) * 1024 : Number(m[1])))
    .filter(n => Number.isFinite(n) && n > 0)
  if (gb.length < 2) return { ramGb: UNKNOWN, storageGb: UNKNOWN }
  const sorted = [...gb].sort((a, b) => a - b)
  return { ramGb: sorted[0], storageGb: sorted[sorted.length - 1] }
}

const num = (v: unknown): Known<number> => (typeof v === 'number' && Number.isFinite(v) ? v : UNKNOWN)
const text = (v: unknown): Known<string> => (typeof v === 'string' && v.trim() ? v.trim() : UNKNOWN)

/**
 * Build one listing's evidence from its own record.
 *
 * 🚨 `raw` is the provider row and is the ONLY source besides the title. The
 * seller lives in `source` as a fact about WHERE it is sold, and is never read
 * to decide WHAT it is.
 */
export function buildListingEvidence(c: Candidate): ListingEvidence {
  const raw = (c.raw ?? {}) as Record<string, unknown>
  const fromTitle = capacitiesFromTitle(c.name)
  // Provider-supplied structured specs win; the title is the fallback. Both
  // belong to THIS listing, which is the only property that matters.
  const ramGb = num(raw.ram_gb) !== UNKNOWN ? num(raw.ram_gb) : fromTitle.ramGb
  const storageGb = num(raw.storage_gb) !== UNKNOWN ? num(raw.storage_gb) : fromTitle.storageGb
  return {
    listingId: c.id,
    title: c.name,
    source: text(raw.source),
    priceVnd: num(c.attrs.priceVnd),
    rating: num(c.attrs.rating),
    reviewCount: num(c.attrs.reviewCount),
    ramGb,
    storageGb,
    chip: chipFromTitle(c.name),
    condition: conditionFromTitle(c.name),
    warranty: UNKNOWN,
    link: text(c.link),
  }
}

/** What the user asked for, from the user's OWN words — never from a listing. */
export function parseRequestedConfig(requestText: string): RequestedConfig {
  const chip = chipFromTitle(requestText)
  const caps = capacitiesFromTitle(requestText)
  return {
    chip: chip === UNKNOWN ? UNKNOWN : chip.value,
    ramGb: caps.ramGb,
    storageGb: caps.storageGb,
  }
}

/**
 * Does the picked listing provably match what was asked for?
 *
 * `'unknown'` is the answer production needed and never had: asked for M1 32GB
 * 512GB, it picked a listing that proves only "M1 Pro" and called it a match.
 * A dimension the listing does not state can never make a match — it can only
 * make the answer unknown — and a dimension it states DIFFERENTLY is a mismatch.
 */
export function evaluateConfigMatch(requested: RequestedConfig, pick: ListingEvidence): ConfigMatch {
  const dims: ('chip' | 'ramGb' | 'storageGb')[] = ['chip', 'ramGb', 'storageGb']
  let sawUnknown = false
  let sawAsked = false
  for (const d of dims) {
    const want = requested[d]
    if (want === UNKNOWN) continue
    sawAsked = true
    const got = d === 'chip' ? (pick.chip === UNKNOWN ? UNKNOWN : pick.chip.value) : pick[d]
    if (got === UNKNOWN) { sawUnknown = true; continue }
    if (String(got).toLowerCase() !== String(want).toLowerCase()) return 'mismatch'
  }
  if (!sawAsked) return 'unknown'
  return sawUnknown ? 'unknown' : 'exact'
}

/**
 * The allow-list: every fact the model is permitted to state, already resolved.
 *
 * Built from established values only. Anything UNKNOWN is deliberately absent
 * from this list and named in the block's absence line instead — so "may I say
 * 32GB?" has a mechanical answer rather than a stylistic one.
 */
function sayableFactsFor(pick: ListingEvidence): string[] {
  const out: string[] = [`ten tin dang: ${pick.title}`]
  if (pick.source !== UNKNOWN) out.push(`noi ban: ${pick.source}`)
  if (pick.priceVnd !== UNKNOWN) out.push(`gia: ${pick.priceVnd} VND (con so chinh xac, KHONG lam tron sang "khoang")`)
  if (pick.rating !== UNKNOWN) out.push(`danh gia san pham: ${pick.rating} (KHONG phai Google Maps)`)
  if (pick.reviewCount !== UNKNOWN) out.push(`so luot danh gia: ${pick.reviewCount}`)
  if (pick.ramGb !== UNKNOWN) out.push(`RAM: ${pick.ramGb}GB`)
  if (pick.storageGb !== UNKNOWN) out.push(`dung luong: ${pick.storageGb}GB`)
  if (pick.chip !== UNKNOWN) out.push(`chip: ${pick.chip.value} (tieu de ghi)`)
  if (pick.condition !== UNKNOWN) out.push(`tinh trang: ${pick.condition.value} (tieu de ghi)`)
  return out
}

/** Fields with no evidence, named so the model sees the hole instead of guessing. */
function unknownFieldsFor(pick: ListingEvidence): string[] {
  const out: string[] = []
  if (pick.ramGb === UNKNOWN) out.push('RAM')
  if (pick.storageGb === UNKNOWN) out.push('dung luong')
  if (pick.chip === UNKNOWN) out.push('chip')
  if (pick.condition === UNKNOWN) out.push('tinh trang/nguon goc (chinh hang, like new, cu, sealed, refurb)')
  out.push('bao hanh')
  if (pick.rating === UNKNOWN) out.push('danh gia')
  if (pick.reviewCount === UNKNOWN) out.push('so luot danh gia')
  return out
}

/**
 * Assemble the decision evidence for one shopping turn.
 *
 * Pure: no clock, no network, no randomness. Everything it returns came from the
 * ranked candidates it was given.
 */
export function buildDecisionEvidence(
  pick: Pick,
  shortlisted: readonly Candidate[],
  totalFound: number | null,
  requestText: string,
): DecisionEvidence {
  const pickEv = buildListingEvidence(pick.candidate)
  const runnerEv = pick.runnerUp ? buildListingEvidence(pick.runnerUp.candidate) : null
  const requested = parseRequestedConfig(requestText)

  const rejected = shortlisted
    .filter(c => c.id !== pick.candidate.id && c.id !== pick.runnerUp?.candidate.id)
    .map(c => {
      const ev = buildListingEvidence(c)
      const delta: Known<number> = typeof ev.priceVnd === 'number' && typeof pickEv.priceVnd === 'number'
        ? ev.priceVnd - pickEv.priceVnd
        : UNKNOWN
      return { listingId: ev.listingId, title: ev.title, source: ev.source, priceVnd: ev.priceVnd, priceDeltaVsPickVnd: delta }
    })

  return {
    v: 1,
    pick: pickEv,
    decidedBy: pick.reasons.filter(r => r.contribution > 0).slice(0, 3).map(r => ({ attribute: r.key, evidence: r.detail })),
    runnerUp: runnerEv
      ? { listing: runnerEv, leadsOn: pick.runnerUp?.leadsOn ? { attribute: pick.runnerUp.leadsOn.key, evidence: pick.runnerUp.leadsOn.detail } : null }
      : null,
    rejected,
    totalFound,
    conditional: pick.conditional,
    unverified: pick.unverified,
    requested,
    configMatch: evaluateConfigMatch(requested, pickEv),
    sayableFacts: sayableFactsFor(pickEv),
  }
}

const money = (v: Known<number>) => (v === UNKNOWN ? UNKNOWN : `${v} VND`)
const attr = (a: TitleAttribute | Unknown) => (a === UNKNOWN ? UNKNOWN : `${a.value} (tieu de ghi)`)

function listingLines(label: string, l: ListingEvidence): string {
  return [
    `${label}: ${l.title}`,
    `  - noi ban: ${l.source}`,
    `  - gia: ${money(l.priceVnd)}`,
    `  - danh gia san pham: ${l.rating}   so luot: ${l.reviewCount}`,
    `  - RAM: ${l.ramGb === UNKNOWN ? UNKNOWN : `${l.ramGb}GB`}   dung luong: ${l.storageGb === UNKNOWN ? UNKNOWN : `${l.storageGb}GB`}`,
    `  - chip: ${attr(l.chip)}`,
    `  - tinh trang/nguon goc: ${attr(l.condition)}`,
    `  - bao hanh: ${l.warranty}`,
  ].join('\n')
}

/**
 * Render the evidence for the model.
 *
 * Used on BOTH turns from the same object, which is the point: the follow-up
 * reads the identical numbers the first turn read, instead of remembering them.
 */
export function renderDecisionEvidenceBlock(ev: DecisionEvidence, followUp: boolean): string {
  const unknowns = unknownFieldsFor(ev.pick)
  const matchLine = ev.configMatch === 'exact'
    ? 'Tin dang nay KHOP voi cau hinh user hoi (da doi chieu tung phan).'
    : ev.configMatch === 'mismatch'
      ? 'CANH BAO: tin dang nay KHAC cau hinh user hoi. PHAI NOI RO cho user biet diem khac, KHONG duoc trinh bay nhu dung y muon.'
      : 'CHUA DU BANG CHUNG de khang dinh tin dang nay dung cau hinh user hoi. PHAI noi ro la tieu de khong ghi du, KHONG duoc coi nhu khop.'

  return `\n\n===== BANG CHUNG QUYET DINH (DU LIEU THAT, DA CHOT) =====
${followUp
    ? 'Day la bang chung cua LUOT TRUOC, do he thong luu lai. Luot nay KHONG tim kiem lai. Moi con so ben duoi la SO THAT — dung dung nguyen van, TUYET DOI KHONG nho lai, KHONG uoc luong, KHONG lam tron.'
    : 'He thong da chon tu du lieu that. Moi con so ben duoi da duoc chot.'}

${listingLines('DA CHON', ev.pick)}
${ev.runnerUp ? `\n${listingLines('PHUONG AN 2', ev.runnerUp.listing)}${ev.runnerUp.leadsOn ? `\n  - hon o diem: ${ev.runnerUp.leadsOn.attribute} — ${ev.runnerUp.leadsOn.evidence}` : '\n  - KHONG co diem nao hon duoc chung minh'}` : '\nPHUONG AN 2: KHONG CO'}
${ev.rejected.length > 0 ? `\nCAC LUA CHON KHAC (chenh lech gia so voi lua chon da chon, con so that):\n${ev.rejected.map(r => `  - ${r.title} | ${r.source} | ${money(r.priceVnd)} | chenh: ${r.priceDeltaVsPickVnd === UNKNOWN ? UNKNOWN : `${r.priceDeltaVsPickVnd} VND`}`).join('\n')}` : ''}

LY DO DA CHON: ${ev.decidedBy.length > 0 ? ev.decidedBy.map(d => `${d.attribute} — ${d.evidence}`).join('; ') : 'KHONG CO'}
${ev.conditional ? 'KHOANG CACH RAT NHO: dien dat thanh cau nghieng ve co dieu kien, khong khang dinh tuyet doi.' : ''}
${ev.unverified.length > 0 ? `CHUA XAC NHAN DUOC: ${ev.unverified.join(', ')} — noi ro la chua chac.` : ''}
${ev.totalFound !== null ? `TONG SO TIN DANG TIM DUOC: ${ev.totalFound} (danh sach tren la phan da chon loc).` : ''}

USER HOI CAU HINH: chip=${ev.requested.chip}, RAM=${ev.requested.ramGb === UNKNOWN ? UNKNOWN : `${ev.requested.ramGb}GB`}, dung luong=${ev.requested.storageGb === UNKNOWN ? UNKNOWN : `${ev.requested.storageGb}GB`}
${matchLine}

CHI DUOC NOI NHUNG DIEU SAU (ngoai ra khong duoc khang dinh them thuoc tinh nao):
${ev.sayableFacts.map(f => `  - ${f}`).join('\n')}

KHONG CO DU LIEU VE: ${unknowns.join(', ')}.
LUAT CUNG:
- Nhung muc ghi "${UNKNOWN}" nghia la KHONG AI NOI — KHONG phai bang 0, KHONG phai la "khong co".
  TUYET DOI KHONG doan, KHONG suy ra tu ten shop, ten mien, uy tin, gia, thuong hieu, hay tin dang khac.
- Neu user hoi ve mot muc ${UNKNOWN}: noi thang la nguon hien tai khong ghi.
- Gia phai doc dung con so tren, KHONG duoc noi "khoang", KHONG duoc lam tron.
- Danh gia o tren la danh gia SAN PHAM. KHONG duoc goi no la Google Maps hay bat ky nguon nao khac.
- Chenh lech gia phai dung dung con so "chenh" o tren, KHONG duoc uoc luong.
- Neu khong co diem nao chung minh duoc phuong an 2 hon: noi thang la khong co danh doi nao duoc chung minh,
  TUYET DOI KHONG bia ra mot diem tru.
==========================================`
}

/**
 * What the model is told when the stored evidence could not be loaded.
 *
 * The safe failure. An expired, foreign, malformed or absent id lands here, and
 * the reply degrades to honesty — never to the reconstruction-from-memory that
 * produced "khoảng 28-29 triệu".
 */
export function renderMissingEvidenceBlock(): string {
  return `\n\n===== BANG CHUNG LUOT TRUOC: KHONG CON =====
Ban KHONG con bang chung san pham cua luot truoc (het han hoac khong co).
- TUYET DOI KHONG nho lai gia, danh gia, RAM, dung luong, chip, tinh trang hay ten shop tu tri nho.
- Noi that mot cau ngan rang ban khong tra cuu lai duoc thong tin chi tiet cua luot truoc,
  va moi user hoi lai de ban tim moi neu can.
==========================================`
}
