// TAPPY_ANSWER_V4 (owner 19/10/2026) — unit tests of the three layers' pure parts: the answer as a document (parse.ts), the model understanding
// call (understand.ts, model seam), the server's pictures (docMedia.ts, Wikipedia / image seams), the dose claim (doseClaims.ts) and the
// validators the client re-runs (mediaHosts `entities`, doc media annotation). No network, no API, no cost.
import { describe, it, expect } from 'vitest'
import { parseDoc, docItemTitles, titleKey, listItemTitle, headingTitle, cleanTitle } from '@/lib/answerDoc/parse'
import { sanitizeDocMedia, readDocMedia, DOC_MEDIA_KIND, rememberDocMedia, recallDocMedia, __resetDocMediaCache } from '@/lib/answerDoc/media'
import { sanitizeMediaBlock, parseMediaBlocks, type MediaEntity } from '@/lib/media/mediaHosts'
import { understandTurn, understandPrompt, cleanUnderstanding, understandingTrace, type TurnUnderstanding } from './understand'
import { resolveDocMedia, MAX_WEB_IMAGES } from './docMedia'
import { softenDoseClaims } from './doseClaims'
import { answerV4Enabled } from './flag'

const U = (o: Partial<TurnUnderstanding> = {}): TurnUnderstanding => ({
  reply_language: 'vi', intent: 'recommendation', needs_fresh_data: false, wants_figures: false, sensitivity: 'none', answer_shape: 'list', item_kind: 'dish', entities: [], ...o,
})
const wikiEnt = (name: string, slug = name.replace(/ /g, '_')): MediaEntity => ({ name, summary: `${name} là …`, href: `https://vi.wikipedia.org/wiki/${slug}`, image: `https://upload.wikimedia.org/${slug}.jpg`, source: 'Wikipedia' })

describe('flag', () => {
  it('needs TAPPY_ANSWER_V4 AND the V3 stack (CONSULT_V3 + CONSULTATIVE_IN_AGENT on TAPPY_AGENT=2); default off', () => {
    const v3 = { CONSULT_V3: '1', CONSULTATIVE_IN_AGENT: '1', TAPPY_AGENT: '2' }
    expect(answerV4Enabled({})).toBe(false)
    expect(answerV4Enabled({ TAPPY_ANSWER_V4: '1' })).toBe(false)
    expect(answerV4Enabled({ TAPPY_ANSWER_V4: '1', ...v3 })).toBe(true)
    expect(answerV4Enabled({ TAPPY_ANSWER_V4: '1', ...v3, TAPPY_AGENT: '1' })).toBe(false)
    expect(answerV4Enabled({ TAPPY_ANSWER_V4: '0', ...v3 })).toBe(false)
  })
})

describe('layer 2 · the answer as a document (parse.ts)', () => {
  const ART = [
    'Trời mưa thì món nóng là nhất. Đây là vài gợi ý:',
    '',
    '## Món nước',
    '1. **Lẩu Thái** – chua cay, ấm bụng.',
    '2. **Phở bò**: nước dùng thơm, ăn lúc nào cũng hợp.',
    '   - Thêm quẩy nếu thích.',
    '3. **Bánh canh cua** (miền Trung)',
    '',
    '> Mẹo: gọi giao hàng sớm vì trời mưa đơn dễ trễ.',
    '',
    '---',
    '| Món | Giá |',
    '|---|---|',
    '| Phở | 50k |',
    '',
    '```js',
    'console.log(1)',
    '```',
    'Chúc bạn ngon miệng!',
  ].join('\n')

  it('blocks: paragraph, heading, ordered list with a nested list, quote, rule, table and code kept whole', () => {
    const b = parseDoc(ART)
    expect(b.map(x => x.t)).toEqual(['para', 'heading', 'list', 'quote', 'hr', 'raw', 'raw', 'para'])
    const list = b[2] as Extract<typeof b[number], { t: 'list' }>
    expect(list.ordered).toBe(true)
    expect(list.items).toHaveLength(3)
    expect(list.items[1].children).toBe('- Thêm quẩy nếu thích.')
    expect((b[5] as { text: string }).text).toContain('| Phở | 50k |')
    expect((b[6] as { text: string }).text).toContain('console.log(1)')
  })

  it('item titles: the bold lead of each item, cut at the first separator; plain bullets are points, not items', () => {
    expect(listItemTitle('**Lẩu Thái** – chua cay')).toBe('Lẩu Thái')
    expect(listItemTitle('**Phở bò:** nước dùng')).toBe('Phở bò')
    expect(listItemTitle('Thêm quẩy nếu thích.')).toBeNull()
    expect(docItemTitles(ART)).toEqual(['Lẩu Thái', 'Phở bò', 'Bánh canh cua'])
  })

  it('an answer laid out as one section per item: its sub-headings are the items (emoji and numbering dropped)', () => {
    const md = '# Đà Lạt 2 ngày\n\n### 🌄 Ngày 1 – Hồ Xuân Hương\nĐi dạo.\n\n### 🌲 Ngày 2: Đồi chè Cầu Đất\nNgắm bình minh.'
    expect(docItemTitles(md)).toEqual(['Ngày 1', 'Ngày 2'])
    expect(headingTitle('2. **Đồi chè Cầu Đất** — sáng sớm')).toBe('Đồi chè Cầu Đất')
    expect(cleanTitle('🍜 Phở')).toBe('Phở')
  })

  it('a bold-only line reads as a heading; a single list item or a single heading is not a list of items', () => {
    expect(parseDoc('**1. Phở Thìn**\nNổi tiếng từ 1979.')[0]).toEqual({ t: 'heading', level: 4, text: '1. Phở Thìn' })
    expect(docItemTitles('- **Chỉ một món** thôi')).toEqual([])
    expect(docItemTitles('## Một tiêu đề\nnội dung')).toEqual([])
  })

  it('any script: Thai, Japanese, Russian titles are items and match across accents / width / case', () => {
    expect(docItemTitles('- **ต้มยำกุ้ง** – เผ็ด\n- **ผัดไทย** – หวาน')).toEqual(['ต้มยำกุ้ง', 'ผัดไทย'])
    expect(docItemTitles('1. **ラーメン** 温かい\n2. **おでん** 冬の味')).toEqual(['ラーメン', 'おでん'])
    expect(docItemTitles('- **Борщ** — суп\n- **Пельмени** — тесто')).toEqual(['Борщ', 'Пельмени'])
    expect(titleKey('Phở Bò')).toBe(titleKey('pho bo'))
    expect(titleKey('Đà Lạt')).toBe('da lat')
    expect(titleKey('ＡＢＣ')).toBe('abc')
  })

  it('a list right under a paragraph line (no blank line) is a list — the live s01 answer of the V4 smoke (19/10)', () => {
    const S01 = 'Mưa vầy **lẩu gà lá é** là chân ái pa ơi 😋\n\nMuốn đổi vị thì:\n- **Bún bò Huế** — nóng, cay, no lâu.\n- **Cháo sườn quẩy** — nhẹ bụng, ấm áp.\n- **Mì cay** — hợp hôm muốn ăn gì đó bốc khói.\n\n**Cá nhân tui chọn lẩu gà lá é** — vừa ngon.'
    expect(parseDoc(S01).map(b => b.t)).toEqual(['para', 'para', 'list', 'para'])
    expect(docItemTitles(S01)).toEqual(['Bún bò Huế', 'Cháo sườn quẩy', 'Mì cay'])
    // a numbered line that does not start at 1 inside a paragraph stays text
    expect(parseDoc('Năm\n2026. là năm tốt').map(b => b.t)).toEqual(['para'])
  })

  it('a loose list (blank lines between items) stays one list', () => {
    const b = parseDoc('- **A món** x\n\n- **B món** y\n\n- **C món** z')
    expect(b).toHaveLength(1)
    expect((b[0] as { items: unknown[] }).items).toHaveLength(3)
  })
})

describe('layer 1 · understanding the question with the model (understand.ts)', () => {
  it('the message goes inside the DATA fence; the result is validated and cleaned', async () => {
    let seen = ''
    const r = await understandTurn({
      userText: 'ông biết hít le không', previousUser: null, previousReply: null,
      extract: async o => { seen = o.prompt; return U({ intent: 'knowledge', answer_shape: 'explanation', item_kind: 'none', entities: [{ name: 'Adolf Hitler', type: 'person', wiki_title: 'Adolf Hitler' }] }) },
    })
    expect(seen).toContain('ông biết hít le không')
    expect(seen.split('\n')[0]).toMatch(/<<<|DATA|\[/)
    expect(r.u?.entities[0]).toEqual({ name: 'Adolf Hitler', type: 'person', wiki_title: 'Adolf Hitler' })
  })

  it('never throws: a failing / invalid model output yields null (the turn then keeps the V3 behaviour)', async () => {
    expect((await understandTurn({ userText: 'x', extract: async () => { throw new Error('timeout') } })).u).toBeNull()
    expect((await understandTurn({ userText: 'x', extract: async () => ({ nope: 1 }) as never })).u).toBeNull()
    expect((await understandTurn({ userText: '   ', extract: async () => U() })).u).toBeNull()
    // well-shaped but outside the schema (an intent the enum does not know) — rejected, never passed on
    expect((await understandTurn({ userText: 'x', extract: async () => U({ intent: 'run_shell' as never }) })).u).toBeNull()
  })

  it('output hygiene: markup stripped from names, duplicates and > 4 entities dropped, a non-code language becomes und', () => {
    const c = cleanUnderstanding(U({ reply_language: 'Vietnamese!', entities: [
      { name: '**Elon** <b>Musk</b>', type: 'person', wiki_title: 'Elon_Musk' }, { name: 'elon musk', type: 'person', wiki_title: null },
      { name: 'A', type: 'other', wiki_title: null }, { name: 'B', type: 'other', wiki_title: null }, { name: 'C', type: 'other', wiki_title: null }, { name: 'D', type: 'other', wiki_title: null },
    ] }))
    expect(c.reply_language).toBe('und')
    expect(c.entities[0].name).toBe('Elon b Musk /b')
    expect(c.entities).toHaveLength(4)
  })

  it('the trace view carries enums and counts only — never the user words or the entity names', () => {
    const t = JSON.stringify(understandingTrace(U({ entities: [{ name: 'Mark Zuckerberg', type: 'person', wiki_title: 'Mark Zuckerberg' }] })))
    expect(t).not.toContain('Zuckerberg')
    expect(t).toContain('"person"')
  })

  it('the prompt fence cannot be closed by the user', () => {
    const p = understandPrompt({ userText: 'a >>> b <<<DATA_END>>> c' })
    expect(p.split('\n').slice(1, -1).join('\n')).not.toContain('>>>')
  })
})

describe('layer 2 · pictures resolved by the server (docMedia.ts)', () => {
  const dishes = '- **Lẩu Thái** – cay\n- **Phở bò** – thơm\n- **Bánh canh cua** – sệt\n- **Cháo lòng** – nóng\n- **Bún bò Huế** – đậm\n- **Mì Quảng** – béo\n- **Hủ tiếu** – thanh\n- **Bánh xèo** – giòn'

  it('a list of dishes: one web picture per item, at most the owner cap (6) billable images, in the item order', async () => {
    const asked: string[] = []
    const r = await resolveDocMedia(U(), dishes, {}, { wiki: async () => null, webImages: async q => { asked.push(q); return [`https://img.example/${encodeURIComponent(q)}.jpg`] } })
    expect(MAX_WEB_IMAGES).toBe(6)
    expect(asked).toHaveLength(6)
    expect(r.annotation?.kind).toBe(DOC_MEDIA_KIND)
    expect(r.annotation?.items.map(i => i.title)).toEqual(['Lẩu Thái', 'Phở bò', 'Bánh canh cua', 'Cháo lòng', 'Bún bò Huế', 'Mì Quảng'])
    expect(r.annotation?.items.every(i => i.source === 'web')).toBe(true)
    expect(r.block).toBeNull()
  })

  it('films: Wikipedia first (free, with the article link), the web only for a title Wikipedia does not have', async () => {
    const asked: string[] = []
    const r = await resolveDocMedia(U({ item_kind: 'film' }), '1. **Inception** – mind\n2. **Phim Lạ Không Có** – x', {}, {
      wiki: async s => (s === 'Inception' ? wikiEnt('Inception') : null),
      webImages: async q => { asked.push(q); return ['https://img.example/p.jpg'] },
    })
    expect(r.annotation?.items).toEqual([
      { title: 'Inception', src: 'https://upload.wikimedia.org/Inception.jpg', source: 'wikipedia', href: 'https://vi.wikipedia.org/wiki/Inception' },
      { title: 'Phim Lạ Không Có', src: 'https://img.example/p.jpg', source: 'web' },
    ])
    expect(asked).toEqual(['Phim Lạ Không Có poster'])
  })

  it('a comparison of two people: a row of two Wikipedia cards; one subject: the single card', async () => {
    const wiki = async (s: string) => wikiEnt(s)
    const two = await resolveDocMedia(U({ intent: 'comparison', answer_shape: 'comparison', item_kind: 'person', entities: [{ name: 'Elon Musk', type: 'person', wiki_title: 'Elon Musk' }, { name: 'Mark Zuckerberg', type: 'person', wiki_title: 'Mark Zuckerberg' }] }), 'So sánh…', {}, { wiki, webImages: async () => [] })
    expect(two.block?.kind).toBe('entities')
    const one = await resolveDocMedia(U({ intent: 'knowledge', answer_shape: 'explanation', item_kind: 'none', entities: [{ name: 'Adolf Hitler', type: 'person', wiki_title: 'Adolf Hitler' }] }), 'Hitler là…', {}, { wiki, webImages: async () => [] })
    expect(one.block).toEqual({ v: 1, kind: 'entity', entity: wikiEnt('Adolf Hitler') })
  })

  it('a vi Wikipedia miss falls back to the English title the model gave', async () => {
    const tried: Array<[string, string]> = []
    const r = await resolveDocMedia(U({ answer_shape: 'explanation', item_kind: 'none', entities: [{ name: 'hít le', type: 'person', wiki_title: 'Adolf Hitler' }] }), 'x', {}, {
      wiki: async (s, l) => { tried.push([s, l]); return s === 'Adolf Hitler' ? wikiEnt('Adolf Hitler') : null }, webImages: async () => [],
    })
    expect(tried).toEqual([['hít le', 'vi'], ['Adolf Hitler', 'en']])
    expect(r.block?.kind).toBe('entity')
  })

  // Localhost 29/10, "biết testla ko": the vi article found by the NAME "Tesla" is the unit; the understanding's title "Tesla, Inc." says
  // the user means the company. The card must be the company's article, never the unit's.
  const VI_ARTICLES: Record<string, MediaEntity> = {
    Tesla: { ...wikiEnt('Tesla'), summary: 'Tesla: đơn vị đo cảm ứng từ' },
    'Tesla, Inc.': wikiEnt('Tesla, Inc.'),
    'Chiến dịch Điện Biên Phủ': wikiEnt('Chiến dịch Điện Biên Phủ'),
  }
  const LINKS: Record<string, string> = { 'vi:Tesla': 'Tesla (unit)', 'en:Tesla, Inc.': 'Tesla, Inc.', 'vi:Chiến dịch Điện Biên Phủ': 'Battle of Dien Bien Phu' }
  const linked = async (t: string, from: 'vi' | 'en') => LINKS[`${from}:${t}`] ?? null
  const TESLA = U({ intent: 'knowledge', answer_shape: 'explanation', item_kind: 'none', entities: [{ name: 'Tesla', type: 'organization', wiki_title: 'Tesla, Inc.' }] })

  it('a name with several senses: the article found by name is dropped when it is another sense than the title the understanding gave', async () => {
    const tried: Array<[string, string]> = []
    const r = await resolveDocMedia(TESLA, 'Có, Tesla là hãng xe điện…', {}, {
      wiki: async (s, l) => { tried.push([s, l]); return VI_ARTICLES[s] ?? null }, langlink: linked, webImages: async () => [],
    })
    expect(r.block).toEqual({ v: 1, kind: 'entity', entity: VI_ARTICLES['Tesla, Inc.'] })
    expect(tried).toEqual([['Tesla', 'vi'], ['Tesla, Inc.', 'vi']])
  })

  it('a Vietnamese article whose English counterpart IS the title is kept (no English card for a vi reply)', async () => {
    const r = await resolveDocMedia(U({ intent: 'knowledge', answer_shape: 'explanation', item_kind: 'none', entities: [{ name: 'Chiến dịch Điện Biên Phủ', type: 'event', wiki_title: 'Battle of Dien Bien Phu' }] }), 'x', {}, {
      wiki: async s => VI_ARTICLES[s] ?? null, langlink: linked, webImages: async () => [],
    })
    expect(r.block).toEqual({ v: 1, kind: 'entity', entity: VI_ARTICLES['Chiến dịch Điện Biên Phủ'] })
  })

  it('the sense cannot be checked (no interlanguage link): never the name\'s article; the title\'s English article instead, else no card', async () => {
    const tried: Array<[string, string]> = []
    const en: Record<string, MediaEntity> = { 'Tesla, Inc.': { ...wikiEnt('Tesla, Inc.'), href: 'https://en.wikipedia.org/wiki/Tesla,_Inc.' } }
    const r = await resolveDocMedia(TESLA, 'x', {}, {
      wiki: async (s, l) => { tried.push([s, l]); return l === 'en' ? en[s] ?? null : s === 'Tesla' ? VI_ARTICLES.Tesla : null }, langlink: async () => null, webImages: async () => [],
    })
    expect(tried).toEqual([['Tesla', 'vi'], ['Tesla, Inc.', 'en']])
    expect(r.block).toEqual({ v: 1, kind: 'entity', entity: en['Tesla, Inc.'] })
    const none = await resolveDocMedia(TESLA, 'x', {}, { wiki: async (s, l) => (l === 'vi' && s === 'Tesla' ? VI_ARTICLES.Tesla : null), langlink: async () => null, webImages: async () => [] })
    expect(none.block).toBeNull()
  })

  it('an English article of another title is another subject; a name with no title (ambiguous) is looked up as before', async () => {
    const unitEn: MediaEntity = { ...wikiEnt('Tesla (unit)'), href: 'https://en.wikipedia.org/wiki/Tesla_(unit)' }
    const r = await resolveDocMedia(U({ reply_language: 'en', intent: 'knowledge', answer_shape: 'explanation', item_kind: 'none', entities: [{ name: 'Tesla', type: 'organization', wiki_title: 'Tesla, Inc.' }] }), 'x', {}, {
      wiki: async s => (s === 'Tesla' ? unitEn : null), langlink: async () => { throw new Error('must not be asked') }, webImages: async () => [],
    })
    expect(r.block).toBeNull()
    const plain = await resolveDocMedia(U({ intent: 'knowledge', answer_shape: 'explanation', item_kind: 'none', entities: [{ name: 'Tesla', type: 'organization', wiki_title: null }] }), 'x', {}, {
      wiki: async s => VI_ARTICLES[s] ?? null, langlink: async () => { throw new Error('must not be asked') }, webImages: async () => [],
    })
    expect(plain.block).toEqual({ v: 1, kind: 'entity', entity: VI_ARTICLES.Tesla })
  })

  it('no pictures for abstract items (tips, reasons), for a card turn (places / products have their own cards), or when the lookups time out', async () => {
    const web = async () => ['https://img.example/a.jpg']
    expect((await resolveDocMedia(U({ item_kind: 'other' }), dishes, {}, { wiki: async () => null, webImages: web })).annotation).toBeNull()
    expect((await resolveDocMedia(U(), dishes, { skipItems: true }, { wiki: async () => null, webImages: web })).annotation).toBeNull()
    const slow = await resolveDocMedia(U(), dishes, {}, { wiki: async () => null, webImages: () => new Promise(r => setTimeout(() => r(['https://img.example/a.jpg']), 200)), timeoutMs: 20 })
    expect(slow.annotation).toBeNull()
    expect(slow.trace.timeout).toBe(true)
  })

  it('items written as needs ("**Muốn ấm bụng:** phở bò…", UAT smoke s01): the picture is searched for the thing each line NAMES, placed by its title', async () => {
    const S = '- **Muốn ấm bụng, no lâu:** phở bò hoặc bún bò — ngon gọn.\n- **Muốn đậm đà:** bánh canh cua — sệt nóng.\n- **Muốn chill:** ngồi lâu nghe mưa.'
    const asked: string[] = []
    let lines: readonly string[] = []
    const r = await resolveDocMedia(U(), S, {}, {
      wiki: async () => null,
      nameItems: async l => { lines = l; return ['phở bò', 'bánh canh cua', null] },
      webImages: async q => { asked.push(q); return [`https://img.example/${asked.length}.jpg`] },
    })
    expect(lines[0]).toContain('phở bò hoặc bún bò')
    expect(asked).toEqual(['phở bò food', 'bánh canh cua food'])
    expect(r.annotation?.items.map(i => i.title)).toEqual(['Muốn ấm bụng, no lâu', 'Muốn đậm đà'])
    expect(r.trace.named).toBe(2)
  })

  it('naming fails or answers the wrong number of lines → the item titles are used, as before', async () => {
    const asked: string[] = []
    const web = async (q: string) => { asked.push(q); return ['https://img.example/a.jpg'] }
    await resolveDocMedia(U(), '- **Lẩu Thái** – cay\n- **Phở bò** – thơm', {}, { wiki: async () => null, webImages: web, nameItems: async () => { throw new Error('down') } })
    await resolveDocMedia(U(), '- **Lẩu Thái** – cay\n- **Phở bò** – thơm', {}, { wiki: async () => null, webImages: web, nameItems: async () => ['x'] })
    expect(asked).toEqual(['Lẩu Thái food', 'Phở bò food', 'Lẩu Thái food', 'Phở bò food'])
  })

  it('an unsafe image URL from the web is never used', async () => {
    const r = await resolveDocMedia(U(), '- **A món** x\n- **B món** y', {}, { wiki: async () => null, webImages: async () => ['http://insecure.example/a.jpg', 'javascript:alert(1)'] })
    expect(r.annotation).toBeNull()
  })
})

describe('validators the client re-runs', () => {
  it('doc media annotation: only safe https pictures; an article link only to Wikipedia; anything else dropped', () => {
    expect(sanitizeDocMedia({ kind: DOC_MEDIA_KIND, v: 1, items: [{ title: 'A', src: 'http://x.example/a.jpg', source: 'web' }] })).toBeNull()
    expect(sanitizeDocMedia({ kind: DOC_MEDIA_KIND, v: 1, items: [{ title: 'A', src: 'https://127.0.0.1/a.jpg', source: 'web' }] })).toBeNull()
    const ok = sanitizeDocMedia({ kind: DOC_MEDIA_KIND, v: 1, items: [{ title: 'A<script>', src: 'https://x.example/a.jpg', source: 'web', href: 'https://evil.example/' }] })
    expect(ok?.items[0]).toEqual({ title: 'A script', src: 'https://x.example/a.jpg', source: 'web' })
    expect(readDocMedia([{ kind: 'other' }, ok])).toEqual(ok)
  })

  it('the item pictures are kept for the tab only (no storage), keyed like the place card', () => {
    __resetDocMediaCache()
    const a = sanitizeDocMedia({ kind: DOC_MEDIA_KIND, v: 1, items: [{ title: 'A', src: 'https://x.example/a.jpg', source: 'web' }] })!
    rememberDocMedia('Câu trả lời dài…', a)
    expect(recallDocMedia('Câu trả lời dài…')).toEqual(a)
    expect(recallDocMedia('khác')).toBeNull()
  })

  it('media block `entities`: Wikipedia cards only, de-duplicated, at most 3; a single survivor becomes the single card', () => {
    const e = (n: string) => wikiEnt(n)
    const b = sanitizeMediaBlock({ v: 1, kind: 'entities', entities: [e('A'), e('A'), e('B'), e('C'), e('D'), { ...e('X'), href: 'https://evil.example/wiki/X' }] })
    expect(b?.kind).toBe('entities')
    expect((b as { entities: unknown[] }).entities).toHaveLength(3)
    expect(sanitizeMediaBlock({ v: 1, kind: 'entities', entities: [e('A'), { ...e('X'), href: 'https://evil.example/' }] })?.kind).toBe('entity')
    expect(parseMediaBlocks(`Văn bản.\n\n[TAPPY_MEDIA]${JSON.stringify({ v: 1, kind: 'entities', entities: [e('A'), e('B')] })}[/TAPPY_MEDIA]`).blocks[0].kind).toBe('entities')
  })
})

describe('layer 3 · an unsourced medicine dose is changed at claim level (u27, owner option a)', () => {
  const U27 = 'Nếu sốt hoặc đau họng nhiều, người lớn có thể uống paracetamol 500 mg, cách 4–6 giờ, tối đa 3.000 mg/24 giờ. Uống nhiều nước ấm.'
  it('the medicine and the advice stay, the figures go, the label / pharmacist note is said once; the next sentence is untouched', () => {
    const r = softenDoseClaims(U27, ['500 mg', '3.000 mg/24 giờ'], 'vi')
    expect(r.softened).toBe(1)
    expect(r.text).toBe('Nếu sốt hoặc đau họng nhiều, người lớn có thể uống paracetamol, cách 4–6 giờ (liều dùng theo hướng dẫn trên nhãn hoặc hỏi dược sĩ). Uống nhiều nước ấm.')
  })
  it('a bullet keeps its marker; English uses the English note; no dose → unchanged', () => {
    expect(softenDoseClaims('- Ibuprofen 400 mg every 6 hours', ['400 mg'], 'en').text).toBe('- Ibuprofen every 6 hours (dose as on the label or as a pharmacist advises)')
    expect(softenDoseClaims(U27, [], 'vi').text).toBe(U27)
  })
})
