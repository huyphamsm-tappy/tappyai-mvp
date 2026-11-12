import { describe, it, expect } from 'vitest'
import { detectEntityCandidates, decorateEntityChips, entityIcon, entityKey, MAX_ENTITY_CHIPS, ENTITY_CHIP_ATTR } from './entityChips'

describe('detectEntityCandidates', () => {
  it('takes the bold names of one to four capitalised words, in order, once each', () => {
    const md = 'Tui thấy **Elon Musk** và **Sam Altman** khác nhau. Lại **Elon Musk**, rồi **OpenAI** và **Đà Lạt**.'
    expect(detectEntityCandidates(md)).toEqual(['Elon Musk', 'Sam Altman', 'OpenAI', 'Đà Lạt'])
  })

  it('never takes a list label, a sentence, a figure, a lower-case phrase or a long span', () => {
    const md = [
      '- **Elon Musk:** kỹ sư', // a label with a colon
      '**Lưu ý** quan trọng', // a known answer label
      '**giảm 50% đồ uống**', // lower case phrase
      '**16:00–19:00**', // figures
      '**Một Hai Ba Bốn Năm**', // five words
      '**Có phải không?**', // question
      '**4,7**',
    ].join('\n')
    expect(detectEntityCandidates(md)).toEqual([])
  })

  it('keeps small connectors inside a name and rejects URLs and markup characters', () => {
    expect(detectEntityCandidates('**Bank of America** và **Leonardo da Vinci**')).toEqual(['Bank of America', 'Leonardo da Vinci'])
    expect(detectEntityCandidates('**Tesla, Inc.** và **Hà Nội,**')).toEqual(['Tesla, Inc.'])
    expect(detectEntityCandidates('**Evil https://x.y** **A/B Test** **<Script>**')).toEqual([])
  })

  it('skips code and the names of the answer\'s own place cards (exclude)', () => {
    const md = '```\n**Fake Name**\n```\n`**Inline Code**` **Off-dry Cocktail** **Saigon Scene**'
    expect(detectEntityCandidates(md, { exclude: ['Off-dry Cocktail & Wine Bar'] })).toEqual(['Saigon Scene'])
  })

  it('caps the number of distinct names', () => {
    const md = Array.from({ length: 20 }, (_, i) => `**Tên Số${String.fromCharCode(65 + i)}**`).join(' ')
    expect(detectEntityCandidates(md)).toHaveLength(MAX_ENTITY_CHIPS)
    expect(detectEntityCandidates(md, { max: 2 })).toHaveLength(2)
    expect(detectEntityCandidates(md, { max: 0 })).toEqual([])
  })
})

describe('entityIcon', () => {
  it('reads the kind of thing from the short description (Vietnamese and English)', () => {
    expect(entityIcon('Doanh nhân, nhà đầu tư')).toBe('👤')
    expect(entityIcon('South African-born businessman')).toBe('👤')
    expect(entityIcon('Công ty xe điện Mỹ')).toBe('🏢')
    expect(entityIcon('American electric vehicle company')).toBe('🏢')
    expect(entityIcon('Thành phố ở Lâm Đồng')).toBe('📍')
    expect(entityIcon('')).toBe('📖')
    expect(entityIcon(undefined)).toBe('📖')
  })
})

describe('decorateEntityChips', () => {
  const resolved = new Map([[entityKey('Elon Musk'), { name: 'Elon Musk', icon: '👤' }]])

  it('turns a resolved bold name into a chip with its icon and attributes', () => {
    const out = decorateEntityChips('<p>Tui thấy <strong>Elon Musk</strong> và <strong>Sam Altman</strong></p>', resolved)
    expect(out).toContain(`${ENTITY_CHIP_ATTR}="Elon Musk"`)
    expect(out).toContain('class="v206-ent"')
    expect(out).toContain('role="button"')
    expect(out).toContain('👤</span>Elon Musk</strong>')
    // an UNRESOLVED name stays a plain bold: no chip without a real profile
    expect(out).toContain('<strong>Sam Altman</strong>')
    expect(out.match(/v206-ent"/g)).toHaveLength(1)
  })

  it('changes nothing when nothing is resolved', () => {
    const html = '<strong>Elon Musk</strong>'
    expect(decorateEntityChips(html, new Map())).toBe(html)
  })

  it('does not touch bold inside a link, or bold with other markup, or a bold that only contains the name', () => {
    const inLink = '<a href="https://x.test"><strong>Elon Musk</strong></a>'
    expect(decorateEntityChips(inLink, resolved)).toBe(inLink)
    const nested = '<strong>Elon Musk <em>x</em></strong>'
    expect(decorateEntityChips(nested, resolved)).toBe(nested)
    const longer = '<strong>Elon Musk Jr</strong>'
    expect(decorateEntityChips(longer, resolved)).toBe(longer)
  })

  it('escapes the name placed in attributes (no attribute break-out)', () => {
    const evil = new Map([[entityKey('A "B" <C>'), { name: 'A "B" <C>', icon: '📖' }]])
    const out = decorateEntityChips('<strong>A &quot;B&quot; &lt;C&gt;</strong>', evil)
    expect(out).toContain('data-entity-chip="A &quot;B&quot; &lt;C&gt;"')
    expect(out).not.toMatch(/data-entity-chip="A "B"/)
  })
})
