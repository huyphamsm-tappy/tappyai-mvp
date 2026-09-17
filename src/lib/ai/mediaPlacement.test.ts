// @vitest-environment node
/**
 * G3 — MEDIA_PLACEMENT_V2: a venue's photo / TikTok / link lines are never inserted
 * mid-sentence. The fixtures are the reply shapes from the 2026-09-17 mobile-path
 * replay (13 of 69 blocks landed inside a sentence, always "… hoặc **B** …").
 *
 * The invariant checked everywhere: every inserted block sits at a LINE BOUNDARY of
 * the original text (the prose before it, trimmed, is a prefix of the original that
 * ends at a newline or at the end) — never mid-line, hence never mid-sentence. The
 * lines themselves and the markers are byte-identical to v1.
 */
import { describe, expect, it } from 'vitest'
import { injectPlaceEnrichment } from './streamEnrichment'

const P = (name: string, n: number) => ({ name, photo_url: `https://img.example/${n}.jpg`, order_links: [{ name: 'ShopeeFood', url: `https://shopeefood.vn/s?q=${n}` }] })
const KAMURA = P('Izakaya Kamura', 1), KOHAKU = P('KOHAKU RAMEN & UDON', 2), MAYONAKA = P('Mayonaka Sushi', 3)
const IMG = /!\[Ảnh địa điểm\]\(https:\/\/img\.example\/\d\.jpg\)/g

/** Every inserted line must start at a line boundary of the ORIGINAL text. */
function insertedAtLineBoundaries(out: string, original: string): { ok: boolean; blocks: number; offending: string[] } {
  const origLines = new Set(original.split('\n'))
  const lines = out.split('\n')
  const offending: string[] = []
  let blocks = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim() || origLines.has(l)) continue
    if (!/^(?:!\[|🎵 \[|\[)/.test(l.trim())) { offending.push(`changed prose line: ${l.slice(0, 80)}`); continue }
    blocks++
    let j = i - 1; while (j >= 0 && !lines[j].trim()) j--
    const prev = j >= 0 ? lines[j] : ''
    if (prev && !origLines.has(prev) && !/^(?:!\[|🎵 \[|\[)/.test(prev.trim())) offending.push(`block after a cut line: ${prev.slice(-60)}`)
  }
  return { ok: offending.length === 0, blocks, offending }
}
const v1 = (places: ReturnType<typeof P>[], text: string) => injectPlaceEnrichment(places, text)
const v2 = (places: ReturnType<typeof P>[], text: string) => injectPlaceEnrichment(places, text, 'vi', { placement: 'v2' })

describe('G3 · two venues in one sentence', () => {
  // The captured shape (run 2 #1): the Pick in its own paragraph, two runners-up in ONE sentence.
  const text = 'Mình chọn **Mayonaka Sushi** cho bạn 👌\n\nHai lựa chọn khác cũng rất tốt: **Izakaya Kamura** (4.9⭐) nếu bạn muốn không khí izakaya truyền thống, hoặc **KOHAKU RAMEN & UDON** (4.8⭐) nếu thích mì ramen với giá mềm hơn.\n\nBạn muốn đặt bàn không?'
  it('v1 (documented defect): Kamura\'s block is spliced into the sentence, before "hoặc **KOHAKU**"', () => {
    const out = v1([MAYONAKA, KAMURA, KOHAKU], text)
    expect(insertedAtLineBoundaries(out, text).ok).toBe(false)
    expect(out).toMatch(/truyền thống, hoặc\s*\n\n!\[/)
  })
  it('v2: the runner-up blocks land after their paragraph, in mention order, as separate galleries', () => {
    const out = v2([MAYONAKA, KAMURA, KOHAKU], text)
    const check = insertedAtLineBoundaries(out, text)
    expect(check.offending).toEqual([])
    expect(out.match(IMG)?.length).toBe(3)
    const i3 = out.indexOf('img.example/3.jpg'), i1 = out.indexOf('img.example/1.jpg'), i2 = out.indexOf('img.example/2.jpg')
    expect(i3).toBeLessThan(out.indexOf('Hai lựa chọn khác'))
    expect(out.indexOf('giá mềm hơn.')).toBeLessThan(i1)
    expect(i1).toBeLessThan(i2)
    expect(i2).toBeLessThan(out.indexOf('Bạn muốn đặt bàn'))
    expect(out).not.toMatch(/\]\(https:\/\/img\.example\/1\.jpg\)\n!\[/) // a blank line separates the two blocks
    expect(out).toContain('hoặc **KOHAKU RAMEN & UDON** (4.8⭐) nếu thích mì ramen với giá mềm hơn.')
  })
})

describe('G3 · one venue per paragraph is unchanged', () => {
  const text = 'Đây là 2 quán:\n\n**1. Izakaya Kamura**\n4.9⭐ — sushi chuẩn.\n\n**2. Mayonaka Sushi**\nNhỏ gọn, mở đến 0h.'
  it('v1 and v2 agree: after the venue\'s own paragraph, before the next', () => {
    const a = v1([KAMURA, MAYONAKA], text), b = v2([KAMURA, MAYONAKA], text)
    expect(b).toBe(a)
    expect(b.indexOf('sushi chuẩn.')).toBeLessThan(b.indexOf('img.example/1.jpg'))
    expect(b.indexOf('img.example/1.jpg')).toBeLessThan(b.indexOf('**2. Mayonaka Sushi**'))
  })
})

describe('G3 · lists', () => {
  it('unordered items: the block follows the item line, before the next bullet', () => {
    const text = 'Gợi ý:\n- **Izakaya Kamura** — sushi, 4.9⭐\n- **Mayonaka Sushi** — nhỏ gọn\n\nChúc ngon miệng!'
    const out = v2([KAMURA, MAYONAKA], text)
    expect(insertedAtLineBoundaries(out, text).offending).toEqual([])
    expect(out.indexOf('sushi, 4.9⭐')).toBeLessThan(out.indexOf('img.example/1.jpg'))
    expect(out.indexOf('img.example/1.jpg')).toBeLessThan(out.indexOf('- **Mayonaka Sushi**'))
    expect(out.indexOf('nhỏ gọn')).toBeLessThan(out.indexOf('img.example/3.jpg'))
  })
  it('ordered items: blocks follow the WHOLE list (numbering never interrupted), in mention order', () => {
    const text = 'Top 3:\n1. **Izakaya Kamura** — 4.9⭐\n2. **KOHAKU RAMEN & UDON** — 4.8⭐\n3. **Mayonaka Sushi** — 4.9⭐\n\nBạn chọn quán nào?'
    const out = v2([KAMURA, KOHAKU, MAYONAKA], text)
    expect(insertedAtLineBoundaries(out, text).offending).toEqual([])
    expect(out).toContain('1. **Izakaya Kamura** — 4.9⭐\n2. **KOHAKU RAMEN & UDON** — 4.8⭐\n3. **Mayonaka Sushi** — 4.9⭐')
    const i1 = out.indexOf('img.example/1.jpg'), i2 = out.indexOf('img.example/2.jpg'), i3 = out.indexOf('img.example/3.jpg')
    expect(out.indexOf('3. **Mayonaka Sushi**')).toBeLessThan(i1)
    expect(i1).toBeLessThan(i2); expect(i2).toBeLessThan(i3)
    expect(i3).toBeLessThan(out.indexOf('Bạn chọn quán nào?'))
  })
})

describe('G3 · tables, quotes, code blocks — after the whole block', () => {
  it('table', () => {
    const text = 'So sánh:\n| Quán | Điểm |\n|---|---|\n| **Izakaya Kamura** | 4.9⭐ |\n| **Mayonaka Sushi** | 4.9⭐ |\n\nCả hai đều ổn.'
    const out = v2([KAMURA, MAYONAKA], text)
    expect(insertedAtLineBoundaries(out, text).offending).toEqual([])
    expect(out).toContain('| **Izakaya Kamura** | 4.9⭐ |\n| **Mayonaka Sushi** | 4.9⭐ |')
    expect(out.indexOf('| **Mayonaka Sushi** | 4.9⭐ |')).toBeLessThan(out.indexOf('img.example/1.jpg'))
  })
  it('block quote', () => {
    const text = '> **Izakaya Kamura** được khách khen\n> vì sushi tươi.\n\nMình chọn quán này.'
    const out = v2([KAMURA], text)
    expect(insertedAtLineBoundaries(out, text).offending).toEqual([])
    expect(out.indexOf('> vì sushi tươi.')).toBeLessThan(out.indexOf('img.example/1.jpg'))
  })
  it('code fence', () => {
    const text = 'Địa chỉ:\n```\nIzakaya Kamura\n8A Thái Văn Lung\n```\n\nĐi thôi.'
    const out = v2([KAMURA], text)
    expect(insertedAtLineBoundaries(out, text).offending).toEqual([])
    expect(out).toContain('```\nIzakaya Kamura\n8A Thái Văn Lung\n```')
    expect(out.indexOf('8A Thái Văn Lung\n```')).toBeLessThan(out.indexOf('img.example/1.jpg'))
  })
})

describe('G3 · contract', () => {
  it('marker lines and structured blocks are byte-identical; injection still stops at the first marker', () => {
    const text = 'Mình chọn **Izakaya Kamura** cho bạn.\n\n[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]'
    const out = v2([KAMURA], text)
    expect(out).toContain('[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]')
    expect(out.indexOf('img.example/1.jpg')).toBeLessThan(out.indexOf('[CTA_BUTTONS]'))
    expect(out).toContain('![Ảnh địa điểm](https://img.example/1.jpg)')
    expect(out).toContain('[ShopeeFood](https://shopeefood.vn/s?q=1)')
  })
  it('placement: "v1" and no options are byte-identical (flag OFF)', () => {
    const text = 'Hai lựa chọn: **Izakaya Kamura** (4.9⭐) hoặc **KOHAKU RAMEN & UDON** (4.8⭐).'
    expect(injectPlaceEnrichment([KAMURA, KOHAKU], text, 'vi', { placement: 'v1' })).toBe(injectPlaceEnrichment([KAMURA, KOHAKU], text))
  })
  it('dedup window unchanged: a photo already in the text is not re-injected', () => {
    const text = 'Mình chọn **Izakaya Kamura** cho bạn.\n![Ảnh địa điểm](https://img.example/1.jpg)\n\nOK?'
    const out = v2([KAMURA], text)
    expect(out.match(IMG)?.length).toBe(1)
  })
})
