import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  UNKNOWN,
  chipFromTitle,
  conditionFromTitle,
  buildListingEvidence,
  parseRequestedConfig,
  evaluateConfigMatch,
  buildDecisionEvidence,
  renderDecisionEvidenceBlock,
  renderMissingEvidenceBlock,
} from './decisionEvidence'
import type { Candidate } from './candidate'
import type { Pick } from './pick'
import { readDecisionEvidenceId } from '../security/clientInput'

// ── ADR-024 — the ten fabrications production actually produced ─────────────
//
// Every fixture below is a VERBATIM row from the authenticated production UAT of
// 7deee03 on 2026-08-24, captured from the `search_products` tool result. None of
// it is invented, and that matters: #172 shipped with 48 passing tests and 33/33
// killed mutants while missing 3 of 4 real phrasings, because its fixtures were
// tidier than production. Titles here keep their real punctuation, their real
// "8-CPU/14-GPU" noise and their real missing fields.
//
// 🚨 THE CENTRAL FACT: the row production PICKED carries no `ram_gb`, no
// `storage_gb` and no `spec_source` at all — and five runs out of five described
// it as "32GB/512GB chính hãng".

const listing = (
  name: string, source: string, priceVnd: number,
  raw: Record<string, unknown> = {},
): Candidate => ({
  id: `id:${source}`,
  name,
  domain: 'shopping',
  attrs: { priceVnd, rating: 4.7, reviewCount: 704 },
  link: `https://shop/${encodeURIComponent(source)}`,
  raw: { title: name, source, price_vnd: priceVnd, rating: 4.7, rating_count: 704, ...raw },
})

/** row 0 — THE PICK. Says "Chính Hãng"; says nothing whatsoever about RAM or storage. */
const NGOC_NGUYEN = listing(
  'Macbook Pro 14 inch 2021 M1 Pro 8-CPU/14-GPU (Sliver|Gray) Chính Hãng', 'Ngọc Nguyễn Store', 24_490_000)
/** row 1 — the runner-up. 16GB, and "99%" is a condition the title states. */
const LAM_PHONG = listing(
  'Macbook Pro 14 inch 2021 Gray (MKGP3) - M1 Pro 8CPU-14GPU/ 16G/ 512G - 99%', 'Lâm Phong Store', 24_999_000,
  { ram_gb: 16, storage_gb: 512, spec_source: 'title' })
/** row 2 — a genuine M1 32/512, and it states NO condition. */
const ZIN100 = listing(
  'Macbook Pro M1 14,2inch, Apple M1 | 32GB | 512GB', 'Zin100.vn', 25_800_000,
  { ram_gb: 32, storage_gb: 512, spec_source: 'title' })
/** row 3 — the seller is a `.vn` Apple-named domain, and the title still says nothing. */
const TIN_PHAT = listing(
  'Macbook Pro 14inch 2021 M1 (8CPU/14GPU) 32GB/512GB - tinphatapple.vn', 'Tín Phát-Apple', 27_500_000,
  { ram_gb: 32, storage_gb: 512, spec_source: 'title' })
const THINKPRO = listing('Apple Macbook Pro 14 (Apple M1)', 'thinkpro.vn', 27_990_000)
/** row 5 — states "cũ". */
const BACH_LONG = listing(
  'MacBook Pro 14 inch M1 Pro 2021 8CPU/32GB/512GB/14GPU cũ', 'Bạch Long Store', 29_550_000,
  { ram_gb: 32, storage_gb: 512, spec_source: 'title' })

const SHORTLIST = [NGOC_NGUYEN, LAM_PHONG, ZIN100, TIN_PHAT, THINKPRO, BACH_LONG]
const REQUEST = 'Tôi muốn mua MacBook Pro 14 M1 32GB 512GB, tư vấn giúp mình chọn'

const PICK: Pick = {
  candidate: NGOC_NGUYEN,
  reasons: [
    { key: 'rating', detail: 'rated 4.7', contribution: 1 },
    { key: 'reviewCount', detail: '704 reviews', contribution: 0.8 },
    { key: 'price', detail: '24490000 VND', contribution: 0.6 },
  ],
  runnerUp: { candidate: LAM_PHONG, leadsOn: null },
  conditional: true,
  unverified: [],
}

const EV = buildDecisionEvidence(PICK, SHORTLIST, 40, REQUEST)
const BLOCK = renderDecisionEvidenceBlock(EV, false)
const FOLLOW_UP = renderDecisionEvidenceBlock(EV, true)

// ── 1. missing RAM/storage becomes an explicit hole, not a silence ──────────

describe('1 — "32GB/512GB" for a listing that states neither', () => {
  it('the picked listing records both as UNKNOWN', () => {
    expect(EV.pick.ramGb).toBe(UNKNOWN)
    expect(EV.pick.storageGb).toBe(UNKNOWN)
  })

  it('UNKNOWN is a present key, never an omitted one', () => {
    // Omission reads as silence, and silence is exactly what got filled in.
    expect(Object.keys(EV.pick)).toContain('ramGb')
    expect(Object.keys(EV.pick)).toContain('storageGb')
  })

  it('UNKNOWN is not 0 and not false', () => {
    expect(EV.pick.ramGb).not.toBe(0)
    expect(EV.pick.ramGb).not.toBe(false)
    expect(EV.pick.ramGb).not.toBeNull()
  })

  it('the model is told, in words, that RAM and storage are unknown', () => {
    expect(BLOCK).toContain('KHONG CO DU LIEU VE:')
    expect(BLOCK).toMatch(/KHONG CO DU LIEU VE:[^\n]*RAM/)
    expect(BLOCK).toMatch(/KHONG CO DU LIEU VE:[^\n]*dung luong/)
  })

  it('neither figure appears in the sayable list', () => {
    expect(EV.sayableFacts.some(f => f.includes('RAM'))).toBe(false)
    expect(EV.sayableFacts.some(f => f.includes('dung luong'))).toBe(false)
  })

  it('a listing that DOES state them records the numbers', () => {
    const zin = buildListingEvidence(ZIN100)
    expect(zin.ramGb).toBe(32)
    expect(zin.storageGb).toBe(512)
  })

  it('reads capacities from the title when the provider sent none', () => {
    // "16G/ 512G" — the real abbreviation, no "B".
    const fromTitle = buildListingEvidence(listing(
      'Macbook Pro 14 M1 Pro 16G/ 512G', 'Shop X', 1))
    expect(fromTitle.ramGb).toBe(16)
    expect(fromTitle.storageGb).toBe(512)
  })

  it('does not mistake "14-GPU" or "8CPU" for a capacity', () => {
    expect(buildListingEvidence(NGOC_NGUYEN).ramGb).toBe(UNKNOWN)
    const gpu = buildListingEvidence(listing('MacBook M1 Pro 8CPU/14GPU', 'Shop Y', 1))
    expect(gpu.ramGb).toBe(UNKNOWN)
    expect(gpu.storageGb).toBe(UNKNOWN)
  })
})

// ── 2,3,4. condition/provenance is listing-local ────────────────────────────

describe('2,3,4 — condition may not come from seller, domain or reputation', () => {
  it('the picked listing keeps "Chính hãng" because ITS OWN title says so', () => {
    expect(EV.pick.condition).toEqual({ value: 'Chính hãng', evidence: 'title' })
  })

  it('Zin100 states no condition even though the shop is a .vn store', () => {
    expect(buildListingEvidence(ZIN100).condition).toBe(UNKNOWN)
  })

  it('"tinphatapple.vn" in the seller and the title is not provenance', () => {
    // The domain literally contains "apple". It is still not evidence.
    const t = buildListingEvidence(TIN_PHAT)
    expect(t.condition).toBe(UNKNOWN)
    expect(t.source).toBe('Tín Phát-Apple')
  })

  it('warranty is ALWAYS unknown — /shopping has no such field', () => {
    for (const c of SHORTLIST) expect(buildListingEvidence(c).warranty).toBe(UNKNOWN)
  })

  it('the vocabulary covers what production actually said', () => {
    // "chính thức" and "đại lý chính thức" were both asserted from a domain.
    expect(conditionFromTitle('MacBook đại lý chính thức Apple')).toEqual({ value: 'Đại lý chính thức', evidence: 'title' })
    expect(conditionFromTitle('MacBook chính thức')).toEqual({ value: 'Chính thức', evidence: 'title' })
    expect(conditionFromTitle('MacBook bảo hành chính hãng')).toEqual({ value: 'Bảo hành chính hãng', evidence: 'title' })
    expect(conditionFromTitle('MacBook Like New 99%')).not.toBe(UNKNOWN)
    expect(conditionFromTitle('MacBook refurbished')).toEqual({ value: 'Refurbished', evidence: 'title' })
    expect(conditionFromTitle('MacBook nguyên seal')).toEqual({ value: 'Sealed', evidence: 'title' })
  })

  it('reads "cũ" and "99%" from the real titles that carry them', () => {
    expect(buildListingEvidence(BACH_LONG).condition).toEqual({ value: 'Cũ', evidence: 'title' })
    expect(buildListingEvidence(LAM_PHONG).condition).toEqual({ value: '99%', evidence: 'title' })
  })

  it('does not fire on ordinary words — "cụ thể" is not "cũ"', () => {
    expect(conditionFromTitle('Nói cụ thể về MacBook')).toBe(UNKNOWN)
    expect(conditionFromTitle('MacBook Pro 14 M1 32GB 512GB')).toBe(UNKNOWN)
  })

  it('a seller name containing a condition word is STILL not evidence', () => {
    // A boundary probe, not a production capture: the shop name below is chosen
    // to be the hardest possible case — it literally reads "Chính Hãng". If the
    // builder ever consults `source` or `link`, this is what it would produce,
    // and production asserted exactly this ("Shop uy tín, chuyên bán MacBook
    // chính hãng") off a seller that did not even say the words.
    const seller = listing('Macbook Pro 14 M1 512GB', 'Chính Hãng Apple Store', 1)
    expect(buildListingEvidence(seller).condition).toBe(UNKNOWN)
    expect(buildListingEvidence(seller).source).toBe('Chính Hãng Apple Store')
  })

  it('a URL path containing a condition word is not evidence either', () => {
    // Mutation M06 survived until this existed. A domain cannot contain "chính
    // hãng" — URLs have no spaces — but a PATH SEGMENT very much can carry a
    // condition: "/laptop-cu/" is how Vietnamese shops spell a used-goods
    // category, and the hyphen leaves "cu" standing as its own word. If the
    // builder ever read `link`, this listing would come back as "Cũ".
    const domain: Candidate = {
      ...listing('Macbook Pro 14 M1 512GB', 'Zin100.vn', 1),
      link: 'https://zin100.vn/laptop-cu/macbook-m1-512gb',
    }
    expect(buildListingEvidence(domain).condition).toBe(UNKNOWN)
    expect(buildListingEvidence(domain).chip).toEqual({ value: 'M1', evidence: 'title' })
    // …and the link is still carried as a link.
    expect(buildListingEvidence(domain).link).toBe('https://zin100.vn/laptop-cu/macbook-m1-512gb')
  })

  it('every condition carries its evidence source, and only "title" exists', () => {
    const c = buildListingEvidence(NGOC_NGUYEN).condition
    expect(c).not.toBe(UNKNOWN)
    expect(c !== UNKNOWN && c.evidence).toBe('title')
  })
})

// ── 5,6. chip and configuration ────────────────────────────────────────────

describe('5,6 — M1 Pro is not M1, and a match must be proven', () => {
  it('the picked listing is an M1 Pro', () => {
    expect(EV.pick.chip).toEqual({ value: 'M1 Pro', evidence: 'title' })
  })

  it('the user asked for M1 32GB 512GB', () => {
    expect(EV.requested).toEqual({ chip: 'M1', ramGb: 32, storageGb: 512 })
  })

  it('so the configuration is a MISMATCH, not a match', () => {
    expect(EV.configMatch).toBe('mismatch')
  })

  it('and the model is ordered to say so rather than present it as wanted', () => {
    expect(BLOCK).toContain('CANH BAO')
    expect(BLOCK).toMatch(/KHAC cau hinh user hoi/)
  })

  it('M1 never collapses into M1 Pro in either direction', () => {
    expect(chipFromTitle('MacBook Pro M1 Pro 32GB')).toEqual({ value: 'M1 Pro', evidence: 'title' })
    expect(chipFromTitle('MacBook Pro M1 32GB')).toEqual({ value: 'M1', evidence: 'title' })
    expect(chipFromTitle('MacBook Pro M1 Max')).toEqual({ value: 'M1 Max', evidence: 'title' })
    expect(evaluateConfigMatch({ chip: 'M1', ramGb: UNKNOWN, storageGb: UNKNOWN },
      buildListingEvidence(NGOC_NGUYEN))).toBe('mismatch')
  })

  it('an unstated dimension makes the answer UNKNOWN — never a match', () => {
    // The exact production shape: chip agrees, capacities are simply absent.
    const m1NoCaps = buildListingEvidence(listing('Macbook Pro 14 M1 Chính Hãng', 'Shop Z', 1))
    expect(evaluateConfigMatch({ chip: 'M1', ramGb: 32, storageGb: 512 }, m1NoCaps)).toBe('unknown')
  })

  it('a listing that proves every asked dimension is an exact match', () => {
    expect(evaluateConfigMatch(parseRequestedConfig(REQUEST), buildListingEvidence(ZIN100))).toBe('exact')
  })

  it('an unknown match is never presented as agreement', () => {
    const m1NoCaps = buildListingEvidence(listing('Macbook Pro 14 M1 Chính Hãng', 'Shop Z', 1))
    const ev = buildDecisionEvidence({ ...PICK, candidate: listing('Macbook Pro 14 M1 Chính Hãng', 'Shop Z', 1) },
      SHORTLIST, 40, REQUEST)
    expect(ev.configMatch).toBe('unknown')
    expect(renderDecisionEvidenceBlock(ev, false)).toContain('CHUA DU BANG CHUNG')
    expect(m1NoCaps.chip).toEqual({ value: 'M1', evidence: 'title' })
  })
})

// ── 7,8. exact numbers, correctly attributed ───────────────────────────────

describe('7,8 — the price and the rating source', () => {
  it('carries the exact price, not a rounded band', () => {
    expect(EV.pick.priceVnd).toBe(24_490_000)
    expect(BLOCK).toContain('24490000')
  })

  it('forbids the "khoảng 28-29 triệu" move explicitly', () => {
    expect(BLOCK).toMatch(/KHONG duoc noi "khoang"/)
    expect(BLOCK).toMatch(/KHONG duoc lam tron/)
  })

  it('labels the rating as a PRODUCT rating and rules out Google Maps by name', () => {
    expect(EV.pick.rating).toBe(4.7)
    expect(BLOCK).toContain('danh gia SAN PHAM')
    expect(BLOCK).toContain('KHONG duoc goi no la Google Maps')
  })

  it('the sayable list pins both facts at their exact values', () => {
    expect(EV.sayableFacts).toContain('gia: 24490000 VND (con so chinh xac, KHONG lam tron sang "khoang")')
    expect(EV.sayableFacts).toContain('danh gia san pham: 4.7 (KHONG phai Google Maps)')
  })
})

// ── 9,10. rejected alternatives and trade-offs ─────────────────────────────

describe('9,10 — differences and trade-offs are computed, not guessed', () => {
  it('carries the REAL price deltas, which are not "1-2 triệu"', () => {
    const deltas = EV.rejected.map(r => r.priceDeltaVsPickVnd)
    expect(deltas).toContain(25_800_000 - 24_490_000)
    expect(deltas).toContain(29_550_000 - 24_490_000)
    expect(BLOCK).toMatch(/chenh: 5060000 VND/)
  })

  it('excludes the pick and the runner-up from the rejected set', () => {
    const ids = EV.rejected.map(r => r.listingId)
    expect(ids).not.toContain(NGOC_NGUYEN.id)
    expect(ids).not.toContain(LAM_PHONG.id)
    expect(EV.rejected).toHaveLength(4)
  })

  it('states plainly that there is no proven trade-off when leadsOn is null', () => {
    expect(EV.runnerUp?.leadsOn).toBeNull()
    expect(BLOCK).toContain('KHONG co diem nao hon duoc chung minh')
    expect(BLOCK).toMatch(/TUYET DOI KHONG bia ra mot diem tru/)
  })

  it('uses the real leadsOn when the ranker established one', () => {
    const ev = buildDecisionEvidence(
      { ...PICK, runnerUp: { candidate: LAM_PHONG, leadsOn: { key: 'price', detail: '24999000 VND', contribution: 0.1 } } },
      SHORTLIST, 40, REQUEST)
    expect(ev.runnerUp?.leadsOn).toEqual({ attribute: 'price', evidence: '24999000 VND' })
  })

  it('keeps totalFound honest', () => {
    expect(EV.totalFound).toBe(40)
    expect(BLOCK).toContain('TONG SO TIN DANG TIM DUOC: 40')
  })
})

// ── the follow-up turn ─────────────────────────────────────────────────────

describe('follow-up — the same numbers, not a memory of them', () => {
  it('renders from the SAME stored object, so the price cannot drift', () => {
    expect(FOLLOW_UP).toContain('24490000')
    expect(FOLLOW_UP).toContain('4.7')
  })

  it('says outright that this turn did not search and memory is banned', () => {
    expect(FOLLOW_UP).toContain('KHONG tim kiem lai')
    expect(FOLLOW_UP).toMatch(/TUYET DOI KHONG nho lai/)
  })

  it('still carries every UNKNOWN across the turn boundary', () => {
    expect(FOLLOW_UP).toMatch(/RAM: KHONG CO DU LIEU/)
    expect(FOLLOW_UP).toMatch(/bao hanh: KHONG CO DU LIEU/)
  })

  it('survives a JSON round-trip — it is stored as jsonb', () => {
    const revived = JSON.parse(JSON.stringify(EV))
    expect(renderDecisionEvidenceBlock(revived, true)).toBe(FOLLOW_UP)
  })

  it('the fail-safe forbids reconstructing anything at all', () => {
    const miss = renderMissingEvidenceBlock()
    expect(miss).toMatch(/TUYET DOI KHONG nho lai gia/)
    expect(miss).toContain('KHONG CON')
    // It must NOT smuggle numbers in.
    expect(miss).not.toMatch(/\d{6,}/)
  })
})

// ── the client may contribute a KEY, never a fact ──────────────────────────

describe('readDecisionEvidenceId — shape only, and nothing else from the body', () => {
  const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

  it('accepts a canonical uuid', () => {
    expect(readDecisionEvidenceId({ decisionEvidenceId: KEY })).toBe(KEY)
  })

  it('rejects anything that is not a uuid', () => {
    for (const bad of ['', 'not-a-uuid', KEY + 'x', KEY.slice(0, -1), '../../etc', 123, null, {}, [KEY]]) {
      expect(readDecisionEvidenceId({ decisionEvidenceId: bad }), String(bad)).toBeNull()
    }
  })

  it('returns null rather than throwing on junk bodies', () => {
    for (const bad of [null, undefined, 'string', 42, []]) {
      expect(readDecisionEvidenceId(bad)).toBeNull()
    }
  })

  it('ignores any product facts a client tries to smuggle alongside the key', () => {
    // The rejected design. Nothing here is read: the function returns the key
    // and the route sources every value from the database.
    const smuggled = {
      decisionEvidenceId: KEY,
      evidence: { pick: { priceVnd: 1, title: 'Free MacBook', condition: 'Chính hãng' } },
      priceVnd: 1, rating: 5.0, owner_id: 'someone-else',
    }
    expect(readDecisionEvidenceId(smuggled)).toBe(KEY)
    expect(Object.keys(readDecisionEvidenceId(smuggled) as unknown as object).length).toBe(KEY.length)
  })
})

// ── wiring: the route must actually use all of this ────────────────────────

describe('the route wires evidence into both turns', () => {
  /**
   * Source with comments stripped — the same helper `architectureLock` uses.
   * Without it a comment that merely DISCUSSES `AI.stream(` counts as a call,
   * and the one-model-call assertion below reports 3 for a route that makes 1.
   */
  const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

  it('freezes and persists on the shopping turn', () => {
    expect(route).toContain('freezeShoppingEvidence')
    expect(route).toContain('_tappy_evidence')
    // Mutation M23 survived until the assertion was scoped to the FUNCTION.
    // `decision_evidence_save` also appears in the carry-forward block, so a
    // bare file-level grep stayed green with the persist call deleted — the
    // first turn would write nothing and every follow-up would fail safe.
    const start = route.indexOf('const freezeShoppingEvidence')
    expect(start).toBeGreaterThan(-1)
    const body = route.slice(start, route.indexOf('\n  }', start))
    expect(body).toContain('decision_evidence_save')
    expect(body).toContain('buildDecisionEvidence(')
  })

  it('loads prior evidence and injects it, or injects the fail-safe', () => {
    expect(route).toContain('decision_evidence_load')
    expect(route).toContain('renderDecisionEvidenceBlock(priorEvidence, true)')
    expect(route).toContain('renderMissingEvidenceBlock()')
  })

  it('mints the id before the stream and returns it as a header', () => {
    const beforeStream = route.slice(0, route.indexOf('AI.stream('))
    expect(beforeStream).toContain('const evidenceId = randomUUID()')
    expect(route).toContain("finalResponse.headers.set('X-Decision-Evidence-Id', evidenceId)")
  })

  it('never reads product facts from the request body', () => {
    // The key is the ONLY thing the client contributes.
    expect(route).toContain('readDecisionEvidenceId(rawBody)')
    expect(route).not.toMatch(/rawBody[^\n]*evidence\s*[:=]\s*[^\n]*price/i)
  })

  it('still makes exactly one model call', () => {
    expect((route.match(/AI\.stream\(/g) || []).length).toBe(1)
  })
})
