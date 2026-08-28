// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  extractMoneyClaims, judgeMoneyClaims, redactUnsupportedClaims, guardMoneyClaimsInText,
  classifyIdentity, requestedEntity, structuredPrice, proseOnly, ROUNDING_TOLERANCE,
  type EvidenceRecord,
} from './moneyGuard'
import { guardSnippetPricesInText } from './snippetPriceGuard'

// ── C3-B.10 contract for the deterministic money guard ───────────────────────
//
// The behaviour under test was established by measurement, not opinion:
// three phases (C3-B.5 prompt, C3-B.6 payload, C3-B.7 retrieval) each failed to
// stop the model asserting a price, and C3-B.9 proved after-the-fact validation
// works on structured evidence (0 false accepts over 16 claims).
//
// Evidence records here mirror the real /shopping shape: price is a STRUCTURED
// field. Nothing is ever parsed out of title or snippet.

const rec = (title: string, price: string, source = 'Shop'): EvidenceRecord => ({ title, price, source, link: 'https://x.vn/p' })

describe('money parsing — a currency unit is mandatory', () => {
  describe('Vietnamese forms are recognised', () => {
    for (const [text, expected] of [
      ['khoảng 7 triệu', 7e6], ['khoảng 7,5 triệu', 7.5e6], ['khoảng 7.5 triệu', 7.5e6],
      ['giá 7,5M', 7.5e6], ['giá 7m', 7e6], ['giá 7000000đ', 7e6], ['giá 7.000.000₫', 7e6],
      ['chỉ 500k', 5e5], ['7 million VND', 7e6],
    ] as const) {
      it(`"${text}"`, () => {
        const c = extractMoneyClaims(text)
        expect(c).toHaveLength(1)
        expect(c[0].lo).toBe(expected)
      })
    }
  })

  describe('English forms are recognised', () => {
    for (const [text, expected] of [['about $699', 699], ['about 699 USD', 699], ['about 699 dollars', 699]] as const) {
      it(`"${text}"`, () => expect(extractMoneyClaims(text)[0].lo).toBe(expected))
    }
    it('marks USD as USD, not VND', () => expect(extractMoneyClaims('about $699')[0].currency).toBe('USD'))
  })

  describe('ranges are recognised as ranges', () => {
    for (const [text, lo, hi] of [['từ 7–8 triệu', 7e6, 8e6], ['tầm 7-8M', 7e6, 8e6], ['11.8–14.7M VND', 11.8e6, 14.7e6]] as const) {
      it(`"${text}"`, () => {
        const c = extractMoneyClaims(text)[0]
        expect(c.kind).toBe('range')
        expect([c.lo, c.hi]).toEqual([lo, hi])
      })
    }
  })

  describe('things that are NOT money', () => {
    // A bare number is never a claim. This single rule is what keeps model
    // numbers, storage, ratings, battery hours, years and percentages out.
    for (const text of [
      'iPhone 15 vs Galaxy S24', 'Sony WH-1000XM5 và Bose QC Ultra', 'bản 128GB và 256GB',
      'đánh giá 4.8/5 sao', 'pin 40 giờ, sạc 3 tiếng', 'ra mắt năm 2026', 'giảm 50%',
      'hỗ trợ 5G và Wi-Fi 6', 'có 3 lựa chọn và 2 màu', 'iPhone 15 Pro Max 256GB',
    ]) {
      it(`"${text}"`, () => expect(extractMoneyClaims(text)).toHaveLength(0))
    }
    // "2 màu": JS \b is ASCII-only, so "à" reads as a non-word char and `M\b`
    // matched this as 2 million. Regression lock for the Unicode boundary.
    it('a Vietnamese word starting with a unit letter is not a unit', () =>
      expect(extractMoneyClaims('có 2 màu và 3 kích cỡ')).toHaveLength(0))
  })

  describe('machine blocks and links are never parsed as prose money', () => {
    for (const [name, text] of [
      ['markdown link', 'xem [Shopee](https://shopee.vn/abc-i.123.456)'],
      ['bare url', 'https://tiki.vn/p?q=1.000.000'],
      // The digits must be followed by a UNIT, or the claim would be rejected
      // for lacking a unit rather than for being inside a URL — and a mutation
      // removing the URL rule would survive.
      ['bare url whose query string looks like a price', 'xem https://tiki.vn/p?q=1.000.000đ&ref=a'],
      ['CTA_BUTTONS', 'ok [CTA_BUTTONS]{"buttons":[{"url":"https://x.vn/?q=1.000.000₫"}]}[/CTA_BUTTONS]'],
      ['FOLLOWUPS', 'ok [FOLLOWUPS]giá 5 triệu|rẻ hơn[/FOLLOWUPS]'],
      ['TAPPY_PLAN', 'ok [TAPPY_PLAN]{"budget_total":"5 triệu"}[/TAPPY_PLAN]'],
    ] as const) {
      it(name, () => expect(extractMoneyClaims(text)).toHaveLength(0))
    }
    it('proseOnly strips every machine block', () => {
      const t = 'a [CTA_BUTTONS]x[/CTA_BUTTONS] b [FOLLOWUPS]y[/FOLLOWUPS] c [TAPPY_PLAN]z[/TAPPY_PLAN]'
      const p = proseOnly(t)
      for (const m of ['CTA_BUTTONS', 'FOLLOWUPS', 'TAPPY_PLAN']) expect(p).not.toContain(m)
    })
  })
})

describe('structured price is authoritative', () => {
  it('reads the price FIELD', () => expect(structuredPrice(rec('X', '6.490.000 ₫'))).toBe(6490000))
  it('never invents one from the title', () => expect(structuredPrice({ title: 'Sony WH-1000XM5 giá 6.490.000₫' })).toBeNull())
  it('treats a missing price as absent, never as zero', () => expect(structuredPrice(rec('X', ''))).toBeNull())
  // A too-short figure is absent, NOT zero: returning 0 would make every
  // "0₫"-shaped comparison match and silently verify claims.
  it('treats an unparseable price as absent, never as zero', () => {
    expect(structuredPrice(rec('X', '₫'))).toBeNull()
    expect(structuredPrice(rec('X', '12'))).toBeNull()
  })
})

describe('product identity — POLICY R5, variants are never collapsed', () => {
  it('exact model matches', () => expect(classifyIdentity('Galaxy S24', rec('Samsung Galaxy S24 256GB', '11.190.000 ₫'))).toBe('EXACT_PRODUCT'))
  for (const title of ['Samsung Galaxy S24 Ultra 5G', 'Galaxy S24 FE Xám', 'Samsung Galaxy S24+ Dual SIM']) {
    it(`"${title}" is a VARIANT of Galaxy S24, not an exact match`, () =>
      expect(classifyIdentity('Galaxy S24', rec(title, '20.000.000 ₫'))).toBe('VARIANT'))
  }
  it('an unrelated product is UNRELATED', () => expect(classifyIdentity('Galaxy S24', rec('iPhone 15 128GB', '18.490.000 ₫'))).toBe('UNRELATED'))
  it('an accessory for the product is ACCESSORY', () =>
    expect(classifyIdentity('Sony WH-1000XM5', rec('Đệm tai nghe Sony WH-1000XM5', '250.000 ₫'))).toBe('ACCESSORY'))

  // POLICY R4 — when the REQUEST is the accessory, the accessory is the target.
  it('POLICY R4: an accessory request makes accessory records the exact target', () =>
    expect(classifyIdentity('đệm tai Sony WH-1000XM5', rec('Đệm tai nghe Sony WH-1000XM5', '250.000 ₫'))).toBe('EXACT_PRODUCT'))
  it('POLICY R4: the parent product is not the target of an accessory request', () =>
    expect(classifyIdentity('đệm tai Sony WH-1000XM5', rec('Tai nghe Sony WH-1000XM5', '6.490.000 ₫'))).toBe('UNRELATED'))

  it('strips query noise the model appends', () => {
    expect(requestedEntity('iPhone 15 price Vietnam')).toBe('iphone 15')
    expect(requestedEntity('Samsung Galaxy S24 price Vietnam')).toBe('samsung galaxy s24')
  })
})

describe('claim matching — POLICY R1', () => {
  const records = [rec('Samsung Galaxy S24 256GB', '13.299.000 ₫'), rec('Samsung Galaxy S24 Ultra', '22.399.000 ₫')]
  const judge = (text: string, rs = records, ents = ['Galaxy S24']) => judgeMoneyClaims(text, rs, ents)

  it('exact price verifies', () => expect(judge('Galaxy S24 giá 13.299.000₫')[0].verdict).toBe('VERIFIED'))
  it('rounding within ±2% verifies', () => expect(judge('Galaxy S24 khoảng 13.3M')[0].verdict).toBe('VERIFIED'))
  it('rounding beyond ±2% does NOT verify', () => expect(judge('Galaxy S24 khoảng 13.8M')[0].verdict).not.toBe('VERIFIED'))
  it('an unsupported price is UNVERIFIED', () => expect(judge('Galaxy S24 khoảng 30 triệu')[0].verdict).toBe('UNVERIFIED'))
  it('the tolerance is 2%, not more', () => expect(ROUNDING_TOLERANCE).toBe(0.02))

  it('a variant price does not verify the base model', () =>
    expect(judge('Galaxy S24 giá 22.399.000₫')[0].verdict).toBe('AMBIGUOUS'))

  it('an accessory price does not verify the product', () => {
    const rs = [rec('Đệm tai nghe Sony WH-1000XM5', '250.000 ₫')]
    expect(judgeMoneyClaims('Sony WH-1000XM5 giá 250.000₫', rs, ['Sony WH-1000XM5'])[0].verdict).toBe('ACCESSORY')
  })
  it('POLICY R4: an accessory price verifies an accessory request', () => {
    const rs = [rec('Đệm tai nghe Sony WH-1000XM5', '250.000 ₫')]
    expect(judgeMoneyClaims('Đệm tai giá 250.000₫', rs, ['đệm tai Sony WH-1000XM5'])[0].verdict).toBe('VERIFIED')
  })

  describe('ranges need BOTH endpoints', () => {
    const rs = [rec('Tai nghe Sony WH-1000XM5', '6.490.000 ₫'), rec('Tai Nghe Sony WH-1000XM5 Chính Hãng', '8.090.000 ₫')]
    it('both endpoints supported → VERIFIED', () =>
      expect(judgeMoneyClaims('Sony WH-1000XM5 từ 6.49 - 8.09 triệu', rs, ['Sony WH-1000XM5'])[0].verdict).toBe('VERIFIED'))
    it('only one endpoint supported → NOT verified', () =>
      expect(judgeMoneyClaims('Sony WH-1000XM5 từ 6.49 - 12 triệu', rs, ['Sony WH-1000XM5'])[0].verdict).not.toBe('VERIFIED'))
  })

  describe('POLICY R2 — derived differences', () => {
    const rs = [rec('Samsung Galaxy S24', '10.000.000 ₫'), rec('Samsung Galaxy S24', '12.000.000 ₫')]
    it('difference of two verified operands verifies', () => {
      const claims = judgeMoneyClaims('Galaxy S24 giá 10.000.000₫ hoặc 12.000.000₫, chênh 2 triệu', rs, ['Galaxy S24'])
      expect(claims.find(c => c.lo === 2e6)?.verdict).toBe('VERIFIED')
    })
    it('a difference with an unsupported operand does NOT verify', () => {
      const claims = judgeMoneyClaims('Galaxy S24 rẻ hơn 2 triệu', rs, ['Galaxy S24'])
      expect(claims[0].verdict).not.toBe('VERIFIED')
    })
    // Arithmetic must run over VERIFIED values only. If it ran over every
    // detected value, two invented operands could manufacture a "verified"
    // difference out of nothing — the exact laundering R2 exists to prevent.
    it('two unsupported operands cannot manufacture a verified difference', () => {
      const claims = judgeMoneyClaims('Bản A khoảng 30 triệu, bản B khoảng 32 triệu, chênh 2 triệu.', rs, ['Galaxy S24'])
      for (const c of claims) expect(c.verdict).not.toBe('VERIFIED')
    })
  })
})

describe('redaction — POLICY R3', () => {
  const rs = [rec('Samsung Galaxy S24', '13.299.000 ₫')]
  it('removes the unsupported amount from the output', () => {
    const text = 'S24 rẻ hơn khoảng 3–5 triệu và phù hợp hơn nếu bạn ưu tiên camera.'
    const out = guardMoneyClaimsInText(text, rs, ['Galaxy S24'])
    expect(out.text).not.toContain('3–5 triệu')
    expect(out.text).toContain('camera')
  })
  it('preserves a supported amount', () => {
    const text = 'Galaxy S24 giá 13.299.000₫ tại cửa hàng.'
    expect(guardMoneyClaimsInText(text, rs, ['Galaxy S24']).text).toContain('13.299.000')
  })
  // The guard returns early when nothing is unsupported, so a "preserves a
  // supported amount" test alone never exercises redaction. This one does:
  // both kinds of claim in one reply, only the bad one may go.
  it('removes only the unsupported claim when a supported one is present', () => {
    const text = 'Galaxy S24 giá 13.299.000₫ tại cửa hàng. Bản Ultra khoảng 30 triệu.'
    const out = guardMoneyClaimsInText(text, rs, ['Galaxy S24'])
    expect(out.text).toContain('13.299.000')
    expect(out.text).not.toContain('30 triệu')
  })

  it('never invents a replacement number', () => {
    const text = 'Giá tầm 30 triệu nhé.'
    const out = guardMoneyClaimsInText(text, rs, ['Galaxy S24']).text
    expect(out).not.toMatch(/\d/)
  })
  it('introduces no characters that were not in the input', () => {
    const text = 'Máy này khoảng 30 triệu và rất bền.'
    const out = guardMoneyClaimsInText(text, rs, ['Galaxy S24']).text
    for (const word of out.split(/\s+/).filter(Boolean)) expect(text).toContain(word.replace(/[.,]$/, ''))
  })
})

describe('the guard is inert without structured evidence', () => {
  // Organic retrieval carries no `price` field. Treating that as "nothing is
  // supported" would redact prices that are in fact grounded, so the guard
  // enforces only where it can verify.
  it('does nothing when no record has a structured price', () => {
    const organic = [{ title: 'Sony WH-1000XM5', link: 'https://x.vn' }]
    const text = 'Sony WH-1000XM5 khoảng 7 triệu.'
    const out = guardMoneyClaimsInText(text, organic, ['Sony WH-1000XM5'])
    expect(out.enforced).toBe(false)
    expect(out.text).toBe(text)
  })
  it('enforces as soon as a structured price exists', () => {
    const out = guardMoneyClaimsInText('Galaxy S24 khoảng 30 triệu.', [rec('Samsung Galaxy S24', '13.299.000 ₫')], ['Galaxy S24'])
    expect(out.enforced).toBe(true)
    expect(out.text).not.toContain('30 triệu')
  })
})

// ── C3-B.10.2: the three defects found by the C3-B.10.1 audit ───────────────

describe('F1 — a currency symbol BEFORE the number is still a money claim', () => {
  // Shopee renders prices as "₫6.490.000". A prefix form the parser cannot see
  // is a price it can never redact, so it reaches the user unchecked.
  for (const [text, expected] of [
    ['₫7,500,000', 7500000], ['₫6.490.000', 6490000], ['giá ₫30.000.000 nhé', 30000000],
    ['VNĐ 7.500.000', 7500000], ['$699', 699], ['US$699', 699],
  ] as const) {
    it(`"${text}"`, () => {
      const c = extractMoneyClaims(text)
      expect(c).toHaveLength(1)
      expect(c[0].lo).toBe(expected)
    })
  }
  it('the prefix form does not create claims out of non-money text', () => {
    for (const t of ['iPhone 15', 'bản 128GB', 'giảm 50%', 'pin 40 giờ']) {
      expect(extractMoneyClaims(t)).toHaveLength(0)
    }
  })
  it('an unsupported prefix-form price is redacted like any other', () => {
    const rs = [rec('Samsung Galaxy S24', '13.299.000 ₫')]
    const out = guardMoneyClaimsInText('Galaxy S24 giá ₫30.000.000 tại cửa hàng.', rs, ['Galaxy S24'])
    expect(out.text).not.toContain('30.000.000')
  })
})

describe('F2 — the guard must never empty the assistant prose', () => {
  const rs = [rec('Samsung Galaxy S24', '13.299.000 ₫')]
  // POLICY (owner, C3-B.10.2): remove the whole sentence by default; widen to
  // removing only the money phrase ONLY when sentence removal would leave
  // nothing. Never emit "", never invent a replacement.
  it('a reply that is a single unsupported sentence keeps its non-price words', () => {
    const out = guardMoneyClaimsInText('Galaxy S24 khoảng 30 triệu.', rs, ['Galaxy S24'])
    expect(out.text.trim()).not.toBe('')
    expect(out.text).toContain('Galaxy S24')
    expect(out.text).not.toContain('30 triệu')
  })
  it('introduces no characters that were not in the input', () => {
    const text = 'Galaxy S24 khoảng 30 triệu.'
    const out = guardMoneyClaimsInText(text, rs, ['Galaxy S24']).text
    for (const w of out.split(/\s+/).filter(Boolean)) expect(text).toContain(w.replace(/[.,]$/, ''))
  })
  it('still removes the whole sentence when other sentences remain', () => {
    const text = 'Galaxy S24 rất bền. Giá khoảng 30 triệu. Máy dùng Snapdragon.'
    const out = guardMoneyClaimsInText(text, rs, ['Galaxy S24']).text
    expect(out).not.toContain('30 triệu')
    expect(out).not.toContain('Giá khoảng')   // the sentence went, not just the number
    expect(out).toContain('rất bền')
    expect(out).toContain('Snapdragon')
  })
})

describe('F3 — redaction never leaves a dangling connective', () => {
  const rs = [rec('Samsung Galaxy S24', '13.299.000 ₫')]
  for (const text of [
    'S24 rẻ hơn khoảng 3–5 triệu và phù hợp nếu bạn ưu tiên camera.',
    'S24 costs about 30 million and is better if you prioritise the camera.',
  ]) {
    it(`"${text.slice(0, 34)}…" does not start with a conjunction`, () => {
      const out = guardMoneyClaimsInText(text, rs, ['Galaxy S24']).text
      expect(out.trim()).not.toMatch(/^(và|and|hoặc|or|nhưng|but|,|;)\b/i)
      expect(out.trim()).not.toBe('')
    })
  }
  it('a removed middle sentence leaves the neighbours intact and unjoined', () => {
    const text = 'Máy rất tốt. Giá khoảng 30 triệu. Pin dùng cả ngày.'
    const out = guardMoneyClaimsInText(text, rs, ['Galaxy S24']).text
    // EXACT equality on purpose: `toContain` passed whether the sentence was
    // removed or merely stripped of its amount, so it could not tell the
    // default (sentence-level) apart from the fallback (amount-only).
    expect(out).toBe('Máy rất tốt. Pin dùng cả ngày.')
  })
})

// ── STEP 10: streaming safety, proved through the real filter ───────────────
//
// The guard's control point is `emitReconstructed()` inside
// applyPlaceEnrichmentStreamFilter — the last place the COMPLETE prose exists
// server-side. These drive the actual filter over a real SSE-shaped stream, so
// they also prove the wiring: the filter must hand the guard both the requested
// entity (from the tool call's `args.query`) and the structured records.
describe('stream filter integration — nothing unsupported reaches the client', () => {
  const call = (query: string) =>
    `9:${JSON.stringify({ toolCallId: 'c1', toolName: 'search_products', args: { query } })}`
  const result = (records: EvidenceRecord[]) =>
    `a:${JSON.stringify({ toolCallId: 'c1', result: { search_results: records } })}`
  const say = (t: string) => `0:${JSON.stringify(t)}`
  /** Only the `0:` prose frames — the text the user actually reads. The `a:`
   *  evidence frames legitimately carry the prices and must not be asserted on,
   *  or every check passes (or fails) for the wrong reason. */
  const run = async (lines: string[]): Promise<string> => {
    const { applyPlaceEnrichmentStreamFilter } = await import('./streamEnrichment')
    const filtered = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'))
    const raw = await new Response(filtered.body).text()
    return raw.split('\n').filter(l => l.startsWith('0:'))
      .map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
  }
  const S24 = rec('Samsung Galaxy S24 256GB', '13.299.000 ₫')

  it('an unsupported price never reaches the client', async () => {
    const out = await run([call('Galaxy S24 price Vietnam'), result([S24]), say('Galaxy S24 khoảng 30 triệu.'), 'd:{}'])
    expect(out).not.toContain('30 triệu')
  })

  it('a supported price is passed through untouched', async () => {
    const out = await run([call('Galaxy S24 price Vietnam'), result([S24]), say('Galaxy S24 giá 13.299.000₫.'), 'd:{}'])
    expect(out).toContain('13.299.000')
  })

  it('the requested entity reaches the guard — an accessory request keeps its price', async () => {
    const pad = rec('Đệm tai nghe Sony WH-1000XM5', '250.000 ₫')
    const out = await run([call('đệm tai Sony WH-1000XM5'), result([pad]), say('Đệm tai giá 250.000₫.'), 'd:{}'])
    expect(out).toContain('250.000')
  })

  it('an accessory price claimed as the PRODUCT price is removed', async () => {
    const pad = rec('Đệm tai nghe Sony WH-1000XM5', '250.000 ₫')
    const out = await run([call('Sony WH-1000XM5'), result([pad]), say('Sony WH-1000XM5 giá 250.000₫.'), 'd:{}'])
    expect(out).not.toContain('250.000')
  })

  // F2 end to end: the filter only enqueues when `finalText` is truthy, so an
  // empty guard result means the user receives NO assistant prose at all.
  it('never emits an empty prose frame, even when every sentence is unsupported', async () => {
    const out = await run([call('Galaxy S24'), result([S24]), say('Galaxy S24 khoảng 30 triệu.'), 'd:{}'])
    expect(out.trim()).not.toBe('')
    expect(out).toContain('Galaxy S24')
    expect(out).not.toContain('30 triệu')
  })

  it('a prefix-form unsupported price is redacted end to end', async () => {
    const out = await run([call('Galaxy S24'), result([S24]), say('Galaxy S24 giá ₫30.000.000 tại cửa hàng.'), 'd:{}'])
    expect(out).not.toContain('30.000.000')
    expect(out.trim()).not.toBe('')
  })

  it('leaves organic (unstructured) evidence alone — the guard stays inert', async () => {
    const organic = [{ title: 'Sony WH-1000XM5', link: 'https://x.vn' }] as EvidenceRecord[]
    const out = await run([call('Sony WH-1000XM5'), result(organic), say('Khoảng 7 triệu.'), 'd:{}'])
    expect(out).toContain('7 triệu')
  })
})

// ── regression fixtures: the six same-turn captures from C3-B.9 ─────────────
describe('C3-B.9 fixtures — real replies against same-turn structured evidence', () => {
  const fixtures = JSON.parse(readFileSync('src/lib/ai/__fixtures__/moneyGuard.fixtures.json', 'utf8')) as Array<{
    id: string; request: string; shoppingQueries: string[]; records: EvidenceRecord[]; reply: string
  }>

  it('loads all six captured turns', () => expect(fixtures).toHaveLength(6))

  for (const f of fixtures) {
    it(`${f.id} — no unsupported amount survives the guard`, () => {
      const out = guardMoneyClaimsInText(f.reply, f.records, f.shoppingQueries)
      expect(out.enforced).toBe(true)
      const surviving = judgeMoneyClaims(out.text, f.records, f.shoppingQueries)
      expect(surviving.filter(c => c.verdict !== 'VERIFIED')).toEqual([])
    })
  }

  it('keeps the grounded Sony prices on the exact-model turn', () => {
    const f = fixtures.find(x => x.id.startsWith('T3'))!
    const claims = judgeMoneyClaims(f.reply, f.records, f.shoppingQueries)
    expect(claims.filter(c => c.verdict === 'VERIFIED').length).toBeGreaterThan(0)
  })

  it('never upgrades the under-specified Bose request to VERIFIED', () => {
    const f = fixtures.find(x => x.id.startsWith('T2'))!
    const claims = judgeMoneyClaims(f.reply, f.records, f.shoppingQueries)
    const bose = claims.filter(c => (c.entity ?? '').includes('bose'))
    for (const c of bose) expect(c.verdict).not.toBe('VERIFIED')
  })
})

// ── P0 2026-08-28 — the guard was blind to the WORD "đồng" ───────────────────
//
// Found on production 1867835 while verifying the latency fix. A food follow-up with no
// retrieval answered:
//
//   "…hủ tiếu nam vang ở Phú Nhuận thường có giá khoảng **40.000 - 60.000 đồng/tô**…"
//
// and guardSnippetPricesInText(reply, [], '') returned redacted = 0. An invented price reached
// the user through the guard that exists to stop exactly that.
//
// The cause was one character of boundary. `đ` was in UNIT_ALT, so the engine matched the "đ" of
// "đồng" and then the mandatory unit boundary `(?![\p{L}\d])` saw "ồ" and rejected the whole
// match — no other alternative could match "đồng", so the amount was invisible.
//
// Probing eleven money forms found ten already seen and exactly this one blind, which is why
// reading UNIT_ALT was not enough to notice: even "1,2 triệu đồng" is caught, via "triệu". Only a
// bare amount whose ONLY unit is the spelled-out word slipped. Every A5/A5.1 fixture writes "đ";
// production writes "đồng".
//
// 🚨 The list below is the probe. It stays as one table so a future edit to UNIT_ALT is measured
// against every form at once, not just the one being added.
describe('P0 — the spelled-out currency word "đồng" is a money claim', () => {
  const PRODUCTION = 'Hủ tiếu nam vang ở Phú Nhuận thường có giá khoảng **40.000 - 60.000 đồng/tô** tùy loại.'

  it('reproduces the production escape: the fabricated price is redacted', () => {
    const out = guardSnippetPricesInText(PRODUCTION, [], '')
    expect(out.redacted).toBeGreaterThan(0)
    expect(out.text).not.toContain('40.000')
    expect(out.text).not.toContain('60.000')
  })

  describe('every spelling of the word is caught', () => {
    for (const form of ['40.000 - 60.000 đồng/tô', '40.000 - 60.000 Đồng/tô', '40.000 - 60.000 ĐỒNG/tô', '40.000 - 60.000 dong/tô', '50.000 đồng.', '50.000 đồng một tô']) {
      it(`"${form}"`, () => {
        const claims = extractMoneyClaims(`Món này thường có giá khoảng ${form}`)
        expect(claims).toHaveLength(1)
        expect(claims[0].lo).toBe(form.startsWith('50') ? 50000 : 40000)
        expect(claims[0].currency).toBe('VND')
      })
    }
  })

  describe('the forms that already worked still work', () => {
    // The regression this table exists to prevent: "fixing đồng" by rewriting the unit grammar
    // and silently dropping one of these.
    // Each row lists EVERY amount the form yields. "40k - 60k" is deliberately two claims, not a
    // range: the dash follows the "k", so RANGE_RE cannot span it and each amount is matched on
    // its own. Pinning the count keeps a widened unit grammar from quietly merging or splitting.
    for (const [form, los] of [
      ['40.000 - 60.000 đ/tô', [40000]], ['40.000 - 60.000 VNĐ/tô', [40000]], ['40.000 - 60.000 VND/tô', [40000]],
      ['40k - 60k/tô', [40000, 60000]], ['40 - 60 nghìn/tô', [40000]], ['40 - 60 ngàn/tô', [40000]],
      ['1,2 triệu đồng/đêm', [1.2e6]], ['7.000.000₫', [7e6]], ['$699', [699]],
    ] as const) {
      it(`"${form}"`, () => {
        const c = extractMoneyClaims(`Giá khoảng ${form}`)
        expect(c.map(x => x.lo)).toEqual([...los])
      })
    }
  })

  // ── The false positives that make this more than a one-token edit ──────────
  //
  // "đồng" is also the first syllable of compounds and of proper nouns, and BOTH forms follow a
  // number in ordinary replies:
  //
  //   "5 đồng hồ Casio"        — a watch is the shopping vocabulary itself (see pick.test.ts)
  //   "20 Đồng Khởi, Quận 1"   — a street number, in every places reply that prints an address
  //
  // A false claim here is not harmless: the guard REMOVES the sentence that carries it, so a
  // careless widening would delete addresses and product names from correct replies.
  describe('ordinary prose does not become a money claim', () => {
    for (const text of [
      'Mình tìm được 5 đồng hồ Casio cho bạn.',
      'Cửa hàng có hơn 3.000 đồng hồ đang bán.',
      'Quán ở 20 Đồng Khởi, Quận 1.',
      'Địa chỉ 15 Đồng Nai, Tân Bình.',
      'Quán nằm ở 100 Đồng Đen.',
      'Shop bán 10 đồng phục học sinh.',
      'Số 20 Dong Khoi, Quan 1.',
    ]) {
      it(`"${text}"`, () => expect(extractMoneyClaims(text)).toEqual([]))
    }

    it('KNOWN RESIDUAL: a street number written in thousands is read as an amount', () => {
      // "1.000 Đồng Khởi" is indistinguishable from a price by amount shape, which is the only
      // signal available — the `i` flag rules out testing the following word's case. It is
      // recorded rather than fixed: Vietnamese house numbers are not written with a thousands
      // separator, and the alternative (refusing "đồng" before any word) would reopen the P0 for
      // "50.000 đồng một tô". Left deliberately, and pinned so a future reader sees the trade.
      expect(extractMoneyClaims('Quán số 1.000 Đồng Khởi.')).toHaveLength(1)
    })
  })

  describe('the surrounding policy is unchanged', () => {
    it('a "đồng" price backed by snippet evidence stays visible', () => {
      const out = guardSnippetPricesInText('Tô hủ tiếu khoảng 50.000 đồng.', [50_000], '')
      expect(out.redacted).toBe(0)
      expect(out.text).toContain('50.000 đồng')
    })

    it("the user's own number is still exempt", () => {
      const out = guardSnippetPricesInText('Với ngân sách 500.000 đồng bạn có nhiều lựa chọn.', [], 'dưới 500.000 đồng')
      expect(out.redacted).toBe(0)
      expect(out.text).toContain('500.000 đồng')
    })
  })
})
