import { describe, it, expect } from 'vitest'
import { guardSnippetPricesInText, pricesFromSnippets, type SnippetPriceScope } from './snippetPriceGuard'
import { guardPlaceClaimsInText } from './placeClaimGuard'
import { placeTokensFor, placeNamedBy } from '@/lib/links/placeAttribution'
import { mayAttributeToEntity, provenancedClaim } from './consultative/evidenceProvenance'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 AREA-LEVEL EVIDENCE PRESENTED AS A FACT ABOUT ONE RESTAURANT.
//
// Measured on localhost 2026-09-09, "bún bò ở Quận 1". Every existing axis was
// satisfied — the price was REVIEW_SUPPORTED and it really did appear in a
// retrieved snippet — and the reply still said:
//
//   "Mình chọn **Bún Bò Huế Đông Ba** cho bạn — ... và được nhiều người yêu thích.
//    Giá tham khảo khoảng 25.000–50.000 đồng/phần."
//
// The snippet was "Danh sách quán bún bò Quận 1 ngon" — a listicle about a
// DISTRICT. `evidence_type` says how strong; `SourceId` says who produced it;
// neither could say who it was ABOUT. These tests hold that boundary.
// ─────────────────────────────────────────────────────────────────────────────

/** The batch the measured turn actually returned. */
const BATCH = [
  'Bún Bò Huế Đông Ba', 'nhà hàng bún bò nam bộ', 'Bún Bò Huế Gia Hội',
  'Bún Bò 5T', 'Bún bò Xuà', 'Quán Bún Bò Gánh',
]

/** The real top result of the price search: names several places, so it names none. */
const AREA_SNIPPET = {
  title: 'Danh sách quán bún bò Quận 1 ngon "nhức nách"',
  snippet: 'Tổng hợp các quán bún bò ngon ở Quận 1, giá khoảng 25.000 - 50.000 đồng/tô.',
}
/** A snippet that does name exactly one of them. */
const ENTITY_SNIPPET = {
  title: 'Bún Bò Huế Đông Ba - review',
  snippet: 'Tô đặc biệt ở đây khoảng 60.000 đồng, quán rất đông khách.',
}

describe('who is this evidence about', () => {
  const tokens = placeTokensFor(BATCH)

  it('treats a district listicle as area-level, not as any one restaurant', () => {
    expect(placeNamedBy(AREA_SNIPPET.title, AREA_SNIPPET.snippet, tokens)).toBeNull()
  })

  it('treats a snippet naming exactly one place as entity-level', () => {
    expect(placeNamedBy(ENTITY_SNIPPET.title, ENTITY_SNIPPET.snippet, tokens)).toBe('Bún Bò Huế Đông Ba')
  })

  it('refuses to attribute a snippet that names two of the batch', () => {
    // Naming two is an area fact about both, never a fact about either.
    expect(placeNamedBy('Đông Ba và Gia Hội đều ngon', '', tokens)).toBeNull()
  })

  it('keeps scope orthogonal to strength — area evidence attributes to nobody', () => {
    expect(mayAttributeToEntity('area', 'Bún Bò Huế Đông Ba', 'Bún Bò Huế Đông Ba')).toBe(false)
    expect(mayAttributeToEntity('entity', 'Bún Bò Huế Đông Ba', 'Bún Bò Huế Đông Ba')).toBe(true)
    expect(mayAttributeToEntity('entity', 'Bún Bò 5T', 'Bún Bò Huế Đông Ba')).toBe(false)
  })

  it('leaves a claim with no scope unstated rather than entity-level', () => {
    expect(provenancedClaim(50_000, 'search_snippet').evidence_scope).toBeUndefined()
  })
})

describe('an area price may not become a restaurant price', () => {
  const scope = (): SnippetPriceScope => ({ byEntity: new Map(), placeNames: BATCH })
  const areaPrices = pricesFromSnippets([`${AREA_SNIPPET.title} ${AREA_SNIPPET.snippet}`])

  it('extracts the area price as evidence at all (control)', () => {
    expect(areaPrices).toContain(25_000)
    expect(areaPrices).toContain(50_000)
  })

  // THE MEASURED REGRESSION, verbatim in shape.
  const PRODUCTION = 'Mình chọn **Bún Bò Huế Đông Ba** cho bạn — quán này gần nhất.\nGiá tham khảo khoảng 25.000 - 50.000 đồng/phần.'

  it('removes an area price attached to a named restaurant', () => {
    const out = guardSnippetPricesInText(PRODUCTION, areaPrices, '', scope())
    expect(out.redacted).toBeGreaterThan(0)
    expect(out.text).not.toContain('25.000')
  })

  it('carries the subject forward — the price sentence need not name the place', () => {
    // The price sits in its OWN sentence; the restaurant is named one sentence earlier.
    expect(guardSnippetPricesInText(PRODUCTION, areaPrices, '', scope()).text).not.toMatch(/50\.000/)
  })

  it('keeps the same area price in a sentence that claims nothing about one venue', () => {
    const general = 'Các quán bún bò ở Quận 1 thường khoảng 25.000 - 50.000 đồng một tô.'
    const out = guardSnippetPricesInText(general, areaPrices, '', scope())
    expect(out.redacted).toBe(0)
    expect(out.text).toContain('25.000')
  })

  it('keeps an entity price on the restaurant the snippet actually named', () => {
    const byEntity = new Map([['Bún Bò Huế Đông Ba', pricesFromSnippets([`${ENTITY_SNIPPET.title} ${ENTITY_SNIPPET.snippet}`])]])
    const text = 'Bún Bò Huế Đông Ba có tô đặc biệt khoảng 60.000 đồng.'
    const out = guardSnippetPricesInText(text, areaPrices, '', { byEntity, placeNames: BATCH })
    expect(out.redacted).toBe(0)
    expect(out.text).toContain('60.000')
  })

  it('will not lend one restaurant another restaurant\'s price', () => {
    const byEntity = new Map([['Bún Bò 5T', [60_000]]])
    const text = 'Bún Bò Huế Đông Ba có tô đặc biệt khoảng 60.000 đồng.'
    expect(guardSnippetPricesInText(text, areaPrices, '', { byEntity, placeNames: BATCH }).redacted).toBeGreaterThan(0)
  })

  it('is unchanged when no scope is supplied (every shipped caller)', () => {
    const out = guardSnippetPricesInText('Tô hủ tiếu khoảng 50.000 đồng.', [50_000], '')
    expect(out.redacted).toBe(0)
  })
})

describe('an unsupported popularity claim is removed, not softened', () => {
  const base = { ratings: [], distancesKm: [], texts: [], placeNames: BATCH }

  it('removes "được nhiều người yêu thích" when nothing supports it', () => {
    const text = 'Bún Bò Huế Đông Ba được nhiều người yêu thích.\nQuán nằm ở Quận 1.'
    const out = guardPlaceClaimsInText(text, base)
    expect(out.redacted).toBeGreaterThan(0)
    expect(out.text).not.toMatch(/yêu thích/)
    // The rest of the reply survives — removal is surgical, not a wipe.
    expect(out.text).toContain('Quận 1')
  })

  it('removes the other popularity phrasings the prompt used to license', () => {
    for (const phrase of ['rất đông khách', 'khá nổi tiếng', 'được ưa chuộng', 'a local favourite']) {
      const text = `Bún Bò Huế Đông Ba ${phrase}.\nQuán nằm ở Quận 1.`
      expect(guardPlaceClaimsInText(text, base).redacted).toBeGreaterThan(0)
    }
  })

  it('does NOT rest a popularity claim on an area-level listicle', () => {
    // The listicle text is retrieved, but it named no single place.
    const text = 'Bún Bò Huế Đông Ba được nhiều người yêu thích.\nQuán nằm ở Quận 1.'
    const withAreaText = { ...base, texts: [`${AREA_SNIPPET.title} ${AREA_SNIPPET.snippet}`] }
    expect(guardPlaceClaimsInText(text, withAreaText).redacted).toBeGreaterThan(0)
  })

  it('keeps the claim when retrieved text named that very place', () => {
    const entityTexts = new Map([['Bún Bò Huế Đông Ba', [ENTITY_SNIPPET.title + ' ' + ENTITY_SNIPPET.snippet]]])
    const text = 'Bún Bò Huế Đông Ba rất đông khách.\nQuán nằm ở Quận 1.'
    expect(guardPlaceClaimsInText(text, { ...base, entityTexts }).redacted).toBe(0)
  })

  it('keeps the claim when the turn retrieved a real rating', () => {
    const text = 'Bún Bò Huế Đông Ba được nhiều người yêu thích.\nQuán nằm ở Quận 1.'
    expect(guardPlaceClaimsInText(text, { ...base, ratings: [4.5] }).redacted).toBe(0)
  })

  it('leaves an ordinary fit judgement alone - that is the assistant to make', () => {
    const text = 'Quán này gần bạn nhất nên tiện ghé.\nQuán nằm ở Quận 1.'
    expect(guardPlaceClaimsInText(text, base).redacted).toBe(0)
  })
})

describe('a search URL is not confirmed online ordering', () => {
  const base = { ratings: [], distancesKm: [], texts: [], placeNames: BATCH }

  // 🚨 MEASURED TWICE. The first UAT said "có đặt online qua ShopeeFood/GrabFood";
  // after a prompt rule forbidding exactly that, the next said "cũng đều có giao
  // hàng". The prompt does not bound the model; this guard does.
  it('removes an ordering claim when no direct ordering page was retrieved', () => {
    const text = 'Bún Bò Huế Đông Ba có đặt online qua ShopeeFood.\nQuán nằm ở Quận 1.'
    const out = guardPlaceClaimsInText(text, base)
    expect(out.redacted).toBeGreaterThan(0)
    expect(out.text).not.toMatch(/đặt online/)
  })

  it('removes the delivery phrasing the second UAT produced', () => {
    const text = 'Hai quán này cũng đều có giao hàng nếu bạn muốn thử.\nQuán nằm ở Quận 1.'
    expect(guardPlaceClaimsInText(text, base).redacted).toBeGreaterThan(0)
  })

  // The one direct link the real turn returned was for a SEVENTH restaurant.
  it('will not lend one venue a direct ordering page belonging to another', () => {
    const orderablePlaces = new Set(['Bún bò Na - Bún Bò Huế - Nguyễn Cảnh Chân'])
    const text = 'Bún Bò Huế Đông Ba có giao hàng tận nơi.\nQuán nằm ở Quận 1.'
    expect(guardPlaceClaimsInText(text, { ...base, orderablePlaces }).redacted).toBeGreaterThan(0)
  })

  it('keeps the claim for a venue that really has a direct ordering page', () => {
    const orderablePlaces = new Set(['Bún Bò Huế Đông Ba'])
    const text = 'Bún Bò Huế Đông Ba có đặt online.\nQuán nằm ở Quận 1.'
    expect(guardPlaceClaimsInText(text, { ...base, orderablePlaces }).redacted).toBe(0)
  })

  it('leaves a QUESTION alone — asking is not asserting', () => {
    const text = 'Quán nằm ở Quận 1.\nBạn muốn đặt online hay đi trực tiếp ăn tại quán?'
    expect(guardPlaceClaimsInText(text, base).redacted).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 THE UAT ARTIFACT: A GUARD THAT DELETED THE SENTENCE NAMING THE VENUE.
//
// Reproduced on localhost 2026-09-09. The model puts the venue's name and an
// unsupported claim in one breath, so whole-sentence removal took the name with
// the claim and the reply opened on an antecedentless "Quán này …":
//
//   in : "Mình chọn **Bún Bò Huế Đông Ba** cho bạn — quán này gần nhất và có giao hàng."
//        "Quán này là lựa chọn tiện lợi nhất."
//   out: "Quán này là lựa chọn tiện lợi nhất."          ← which quán?
//
// Two complementary rules fix it, and NEITHER weakens provenance:
//   · the claim CLAUSE is dropped instead of the sentence, whenever the venue's
//     name survives that trim;
//   · a sentence that loses its antecedent anyway is dropped too.
// Nothing is reworded, and an unsupported claim is never kept to save grammar.
// ─────────────────────────────────────────────────────────────────────────────

describe('removing a claim must not delete the venue it named', () => {
  const ev = (o: object = {}) => ({ ratings: [], distancesKm: [], texts: [], placeNames: BATCH, ...o })
  const ARTIFACT = 'Mình chọn **Bún Bò Huế Đông Ba** cho bạn — quán này gần nhất và có giao hàng. Quán này là lựa chọn tiện lợi nhất.'

  it('keeps the entity-introduction sentence and drops only the claim clause', () => {
    const out = guardPlaceClaimsInText(ARTIFACT, ev())
    expect(out.text).toContain('Bún Bò Huế Đông Ba')
    expect(out.text).toContain('quán này gần nhất')
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('still blocks the unsupported claim it removed the clause for', () => {
    expect(guardPlaceClaimsInText(ARTIFACT, ev()).text).not.toMatch(/giao hàng/)
  })

  it('leaves no antecedentless "Quán này" behind', () => {
    const out = guardPlaceClaimsInText(ARTIFACT, ev())
    // The follow-on sentence survives BECAUSE its antecedent survived.
    expect(out.text).toContain('Quán này là lựa chọn tiện lợi nhất.')
    expect(out.text.indexOf('Bún Bò Huế Đông Ba')).toBeLessThan(out.text.indexOf('Quán này là'))
  })

  it('drops a leading connective with the clause it removes', () => {
    // "và có giao hàng" goes whole; no dangling "và" is left behind.
    expect(guardPlaceClaimsInText(ARTIFACT, ev()).text).not.toMatch(/và\s*\./)
    expect(guardPlaceClaimsInText(ARTIFACT, ev()).text).not.toMatch(/—\s*\./)
  })

  it('drops every unsupported clause in one pass, not just the first', () => {
    const two = 'Mình chọn **Bún Bò Huế Đông Ba** cho bạn, quán này được nhiều người yêu thích và có giao hàng. Quán này gần bạn.'
    const out = guardPlaceClaimsInText(two, ev())
    expect(out.text).toContain('Bún Bò Huế Đông Ba')
    expect(out.text).not.toMatch(/yêu thích/)
    expect(out.text).not.toMatch(/giao hàng/)
  })

  it('falls back to whole-sentence removal when the claim cannot be isolated', () => {
    // One clause: removing the claim would remove the name, so the sentence goes
    // and the orphaned follow-on goes with it.
    const single = 'Mình tìm bún bò cho bạn nhé!\n\nBún Bò Huế Đông Ba có giao hàng. Quán này là lựa chọn tiện lợi nhất.'
    const out = guardPlaceClaimsInText(single, ev())
    expect(out.text).not.toMatch(/giao hàng/)
    expect(out.text).not.toMatch(/Quán này/)
    expect(out.text).toContain('Mình tìm bún bò cho bạn nhé!')
  })

  it('does not leave a dangling connective when the FIRST clause is removed', () => {
    // 🚨 This is the defect POLICY R3 chose whole-sentence removal to avoid
    // ("và phù hợp…"). Clause removal must not reintroduce it: a surviving
    // clause promoted to first position drops the connective that introduced it.
    const text = 'Có giao hàng và **Bún Bò Huế Đông Ba** cách bạn 0.7km.'
    const out = guardPlaceClaimsInText(text, ev({ distancesKm: [0.7] }))
    expect(out.text).not.toMatch(/giao hàng/)
    expect(out.text).toContain('Bún Bò Huế Đông Ba')
    // NB: a word-boundary escape after "và" never matches - `à` is not an
    // ASCII word character, so that boundary does not exist. Match a space.
    expect(out.text.trimStart()).not.toMatch(/^(và|and)\s/i)
  })

  it('refuses a trim that would drop the venue name with the claim', () => {
    // The OFFENDING clause is the one carrying the name, so trimming it would
    // leave "rất tiện cho bạn." with no subject at all. The sentence must go
    // whole instead — a trim is only allowed to keep the introduction, never to
    // manufacture a subjectless fragment.
    const text = 'Mình tìm bún bò cho bạn nhé!\n\nBún Bò Huế Đông Ba có giao hàng, rất tiện cho bạn.'
    const out = guardPlaceClaimsInText(text, ev())
    expect(out.text).not.toMatch(/giao hàng/)
    expect(out.text).not.toMatch(/rất tiện cho bạn/)
    expect(out.text).toContain('Mình tìm bún bò cho bạn nhé!')
  })

  it('removes an orphan only when its antecedent really is gone', () => {
    const supported = '**Bún Bò Huế Đông Ba** cách bạn 0.7km. Quán này là lựa chọn tiện lợi nhất.'
    const out = guardPlaceClaimsInText(supported, ev({ distancesKm: [0.7] }))
    expect(out.redacted).toBe(0)
    expect(out.text).toContain('Quán này là lựa chọn tiện lợi nhất.')
  })

  it('never restores an unsupported claim to avoid emptying the reply', () => {
    // Both sentences go; the fallback gives back the ORPHAN, never the claim.
    const bare = 'Bún Bò Huế Đông Ba có giao hàng. Quán này là lựa chọn tiện lợi nhất.'
    const out = guardPlaceClaimsInText(bare, ev())
    expect(out.text).not.toMatch(/giao hàng/)
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('does not touch a supported claim or its introduction', () => {
    const ok = 'Bún Bò Huế Đông Ba có đặt online.'
    expect(guardPlaceClaimsInText(ok, ev({ orderablePlaces: new Set(['Bún Bò Huế Đông Ba']) })).redacted).toBe(0)
  })

  it('leaves an English antecedentless sentence out too', () => {
    const en = 'We found options for you.\n\nBun Bo Hue Dong Ba offers delivery. This place is the most convenient.'
    const out = guardPlaceClaimsInText(en, { ratings: [], distancesKm: [], texts: [], placeNames: ['Bun Bo Hue Dong Ba'] })
    expect(out.text).not.toMatch(/offers delivery/)
    expect(out.text).not.toMatch(/This place/)
  })
})
