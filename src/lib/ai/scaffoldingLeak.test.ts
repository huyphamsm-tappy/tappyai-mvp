import { describe, expect, it } from 'vitest'
import { stripModelScaffolding } from './streamEnrichment'

/**
 * REGRESSION (permanent): provider tool-use scaffolding must never reach a client.
 *
 * Observed live on 2026-08-19 on two consecutive `search_products` turns whose
 * search returned nothing. The reply ended:
 *
 *   [CTA_BUTTONS]{"buttons":[...]}</parameter>\n</invoke>
 *
 * `invoke` / `parameter` / `function_calls` appear nowhere in our prompts or tool
 * definitions — they are the model's own tool-call syntax escaping into the text
 * channel. The damage is not only cosmetic: every client's no-closing-tag CTA
 * fallback is END-ANCHORED, so the trailing tags stop it matching and the entire
 * CTA JSON is rendered as prose while the buttons silently disappear.
 */
describe('model tool-use scaffolding never reaches the client', () => {
  // Byte-for-byte the tail captured from the live stream.
  const LEAKED =
    'Bạn có thể tìm trực tiếp trên **Shopee**.\n\n' +
    '[CTA_BUTTONS]{"buttons":[{"label":"🛒 Shopee","type":"search","url":"https://shopee.vn/search?keyword=MacPro","primary":true}]}</parameter>\n</invoke>'

  /** Android's CTA fallback, copied verbatim from ChatResponse.kt CTA_NOTAG_RE. */
  const CTA_NOTAG = /\[CTA_BUTTONS\](\{[\s\S]*\})\s*$/i

  it('removes the exact tags observed in production prose', () => {
    const out = stripModelScaffolding(LEAKED)

    expect(out).not.toContain('</parameter>')
    expect(out).not.toContain('</invoke>')
  })

  it('restores the end-anchored CTA match the leak was breaking', () => {
    // Proves the real damage, not just the cosmetic symptom.
    expect(CTA_NOTAG.test(LEAKED)).toBe(false)
    expect(CTA_NOTAG.test(stripModelScaffolding(LEAKED))).toBe(true)
  })

  it('covers the whole tag vocabulary, opening and closing, namespaced or not', () => {
    const out = stripModelScaffolding(
      '<invoke name="x"><parameter name="y">v</parameter></invoke>' +
        '<function_calls></function_calls><invoke></invoke>keep me',
    )

    // Tags go; whatever sat BETWEEN them is kept ("v" here). Deliberate: this
    // removes a known-invalid tag vocabulary, it does not delete message
    // content, so a malformed tag can never swallow a real sentence.
    expect(out).not.toMatch(/<\/?(?:antml:)?(?:invoke|parameter|function_calls|function_results)\b/i)
    expect(out).toBe('vkeep me')
  })

  it('leaves ordinary prose — including markdown, links and real angle brackets — untouched', () => {
    const prose =
      'Quán **Cà Phê HAN** mở 6h30 — [Xem trên Maps](https://maps.google.com/?q=1,2).\n' +
      'Giá < 30k, phù hợp 2 người. 5 > 3.'

    expect(stripModelScaffolding(prose)).toBe(prose)
  })

  it('is a no-op for text with no angle bracket at all', () => {
    const plain = 'Mình nghiêng về Cà Phê AnAn vì mở sớm và có wifi.'

    expect(stripModelScaffolding(plain)).toBe(plain)
  })
})
