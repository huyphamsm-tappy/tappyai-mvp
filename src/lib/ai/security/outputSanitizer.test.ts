// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file -- every such code point
// is written as a \u{...} escape.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripModelArtifacts, outboundTextSanitizer, undecidedTail } from './outputSanitizer'
import { applyPlaceEnrichmentStreamFilter } from '../streamEnrichment'

const OPEN = '\u{E200}', CLOSE = '\u{E201}', SEP = '\u{E202}'
const CITE = `${OPEN}cite${SEP}turn0search0${CLOSE}`
const LB = '\u{3010}', RB = '\u{3011}', DAGGER = '\u{2020}'
// Live UAT 3 (3027, 14/10/2026), turn M6.1 -- the reply as it reached the user.
const M61 = `**Bún bò Huế Đông Ba** — điểm Google Maps 4.5★ với 452 đánh giá, địa chỉ 140 Nguyễn Gia Trí; giờ tra cứu ghi mở đến 00:00. Nếu muốn quán có nhiều đánh giá hơn, **Bún Bò Huế Kim Hương** ở 118 Phan Văn Trị cũng đang mở, điểm 4.1★ với 580 đánh giá. ${CITE}`
const M61_CLEAN = M61.slice(0, M61.indexOf(` ${OPEN}`))
// Emoji written as escapes: family (ZWJ), rainbow flag (VS16 + ZWJ), thumbs up + skin tone, heart + VS16, keycap, VN flag, England flag (tags).
const EMOJI = '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} \u{1F3F3}\u{FE0F}\u{200D}\u{1F308} \u{1F44D}\u{1F3FD} \u{2764}\u{FE0F} 1\u{FE0F}\u{20E3} \u{1F1FB}\u{1F1F3} \u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'
const hasPrivateUse = (s: string) => [...s].some(c => { const p = c.codePointAt(0)!; return (p >= 0xe000 && p <= 0xf8ff) || p >= 0xf0000 })

describe('stripModelArtifacts -- removes', () => {
  it('the live M6.1 marker, whole, with the space before it', () => {
    expect(stripModelArtifacts(M61)).toBe(M61_CLEAN)
  })
  it('a marker in mid-sentence (several sources inside), its bare text, and the dagger bracket', () => {
    expect(stripModelArtifacts(`Quán A ${OPEN}cite${SEP}turn0search0${SEP}turn1news2${CLOSE} mở đến 22:00.`)).toBe('Quán A mở đến 22:00.')
    expect(stripModelArtifacts('Giá 27.700 đồng/lít. citeturn0search0')).toBe('Giá 27.700 đồng/lít.')
    expect(stripModelArtifacts('Giá 27.700 đồng/lít citeturn0search0turn0news1.')).toBe('Giá 27.700 đồng/lít.')
    expect(stripModelArtifacts(`Theo bảng giá ${LB}3${DAGGER}source${RB} hôm nay.`)).toBe('Theo bảng giá hôm nay.')
    expect(stripModelArtifacts(`Xem tài liệu ${LB}4:0${DAGGER}file.pdf${RB}.`)).toBe('Xem tài liệu.')
  })
  it('a marker cut off at the end of the text -- nothing of it is left ("citetu")', () => {
    expect(stripModelArtifacts(`Xong. ${OPEN}cite${SEP}tu`)).toBe('Xong.')
    expect(stripModelArtifacts(`Xong. ${OPEN}`)).toBe('Xong.')
  })
  it('private-use, tag, bidi, zero-width and control characters', () => {
    expect(stripModelArtifacts('a\u{E123}b\u{F0001}c')).toBe('abc')
    const hidden = [...'hidden'].map(ch => String.fromCodePoint(0xe0000 + ch.charCodeAt(0))).join('')
    expect(stripModelArtifacts(`Xem bản đồ${hidden}.`)).toBe('Xem bản đồ.')
    expect(stripModelArtifacts('link \u{202E}txt.exe\u{202C} an toàn \u{2066}x\u{2069} \u{200F}y\u{200E}\u{061C}')).toBe('link txt.exe an toàn x y')
    expect(stripModelArtifacts('a\u{200B}b\u{200C}c\u{2060}d\u{FEFF}e\u{180E}f')).toBe('abcdef')
    expect(stripModelArtifacts('x\u{0}PLAN0\u{0}y\u{1}\u{2}\u{3}\u{7F}\u{85}z')).toBe('xPLAN0yz')
    expect(stripModelArtifacts('a\u{200D}b')).toBe('ab')
  })
})

describe('stripModelArtifacts -- keeps (negative cases)', () => {
  it('ordinary brackets, numbering and words: only the dagger form is a citation', () => {
    for (const t of [
      `Sản phẩm ${LB}1${RB} bán chạy.`, `${LB}Hàng chính hãng${RB} Nồi chiên 5L`, `Mục ${LB}12${RB} và ${LB}3:4${RB}`, 'Xem [1] và [2].', 'Bước (1), bước (2).',
      '1. Mở app\n2. Chọn món', 'cite this source', 'Hãy cite nguồn khi viết.', 'excite · website · citation · recite', 'citeturn', 'citeturn0', 'Bacciteturn0search0',
    ]) expect(stripModelArtifacts(t), t).toBe(t)
  })
  it('Vietnamese (precomposed and decomposed), markdown, links, line breaks, tabs and emoji', () => {
    for (const t of [
      'Bún bò Huế ngon nhất Đà Nẵng — giá 45.000đ/tô, mở 6:00–22:00.',
      'Bu\u{301}n bo\u{300} Hue\u{302}\u{301}',
      `Gia đình ${EMOJI} đi cùng`,
      'Dòng 1\nDòng 2\r\n\tthụt lề',
      '**Đậm** _nghiêng_ `mã` | a | b |\n|---|---|\n- mục',
      'Xem [vnexpress.net](https://vnexpress.net/chu-de/gia-xang-dau-3026) hoặc https://maps.google.com/?cid=1',
      '(Nguồn: Google Maps)',
    ]) expect(stripModelArtifacts(t), t).toBe(t)
  })
  it('returns the same string when there is nothing to remove', () => {
    const t = 'Không có gì để lọc.'
    expect(stripModelArtifacts(t)).toBe(t)
    expect(stripModelArtifacts('')).toBe('')
  })
})

// -- the stream ---------------------------------------------------------------------------------------------------------------------

const f0 = (s: string) => '0:' + JSON.stringify(s) + '\n'
/** Run raw frame text through the sanitizer, cut into byte chunks at the given offsets; returns the text, the frames and the raw output. */
async function pipe(frames: string[], byteCuts: number[] = [], log = vi.fn()): Promise<{ text: string; lines: string[]; raw: string; log: ReturnType<typeof vi.fn> }> {
  const bytes = new TextEncoder().encode(frames.join(''))
  const cuts = [...byteCuts.filter(c => c > 0 && c < bytes.length), bytes.length]
  const chunks: Uint8Array[] = []
  let from = 0
  for (const c of cuts) { chunks.push(bytes.slice(from, c)); from = c }
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const ch of chunks) c.enqueue(ch); c.close() } })
  const raw = await new Response(body.pipeThrough(outboundTextSanitizer(log))).text()
  const lines = raw.split('\n').filter(Boolean)
  const text = lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  return { text, lines, raw, log }
}
/** Cut a text into text frames at code-point positions. */
const framesAt = (text: string, cuts: number[]) => {
  const cps = Array.from(text)
  const out: string[] = []
  let from = 0
  for (const c of [...cuts, cps.length]) { out.push(f0(cps.slice(from, c).join(''))); from = c }
  return out
}
let seed = 20261014
const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }

const SAMPLES = [
  M61,
  `Quán A ${OPEN}cite${SEP}turn0search0${SEP}turn1news2${CLOSE} mở đến 22:00.`,
  'Giá 27.700 đồng/lít. citeturn0search0',
  `Xong. ${OPEN}cite${SEP}tu`,
  `Theo bảng giá ${LB}3${DAGGER}source${RB} hôm nay, còn ${LB}1${RB} là số thứ tự.`,
  `Gia đình ${EMOJI} và a\u{200D}b`,
  'Bac citeturn0search0x và cite this',
  'Xem [vnexpress.net](https://vnexpress.net/a) — dòng 1\nDòng 2   ',
  `Ẩn${'\u{202E}'}chữ\u{200B} và ${OPEN}`,
]

describe('outboundTextSanitizer -- the client gets exactly stripModelArtifacts(all the text), however the frames are cut', () => {
  it('every single cut position, for every sample', async () => {
    for (const s of SAMPLES) {
      const n = Array.from(s).length
      for (let c = 0; c <= n; c++) {
        const r = await pipe(framesAt(s, [c]))
        expect(r.text, `cut ${c} of ${JSON.stringify(s)}`).toBe(stripModelArtifacts(s))
        expect(r.log).not.toHaveBeenCalled()
      }
    }
  })
  it('random multi-cuts, byte-chunked lines and non-text frames in between (seeded)', async () => {
    const other = ['9:{"toolCallId":"c1","toolName":"web_search","args":{}}\n', '8:[{"kind":"tappy.places.v1","v":1,"items":[]}]\n', 'e:{"finishReason":"tool-calls"}\n']
    for (const s of SAMPLES) {
      const n = Array.from(s).length
      for (let k = 0; k < 40; k++) {
        const cuts = [rand(n + 1), rand(n + 1), rand(n + 1)].sort((a, b) => a - b)
        const frames = framesAt(s, cuts).flatMap(f => (rand(3) === 0 ? [f, other[rand(3)]] : [f]))
        frames.push('d:{"finishReason":"stop"}\n')
        const total = new TextEncoder().encode(frames.join('')).length
        const r = await pipe(frames, [rand(total), rand(total)].sort((a, b) => a - b))
        expect(r.text, `${JSON.stringify(cuts)} of ${JSON.stringify(s)}`).toBe(stripModelArtifacts(s))
        expect(r.log).not.toHaveBeenCalled()
        // every non-text frame is passed byte for byte, and the whole text is out before the finish frame
        for (const o of frames.filter(f => !f.startsWith('0:'))) expect(r.raw).toContain(o)
        const lastText = r.lines.map(l => l.startsWith('0:')).lastIndexOf(true)
        expect(lastText).toBeLessThan(r.lines.indexOf('d:{"finishReason":"stop"}'))
      }
    }
  })
  it('the cut-off marker case end to end: stream and session agree, nothing like "citetu" is left', async () => {
    const r = await pipe([f0(`Xong. ${OPEN}cite${SEP}`), f0('tu'), 'd:{"finishReason":"stop"}\n'])
    expect(r.text).toBe('Xong.')
    expect(stripModelArtifacts(`Xong. ${OPEN}cite${SEP}tu`)).toBe('Xong.')
  })
  it('the undecided end: what waits, and what does not', () => {
    expect(undecidedTail(`a ${OPEN}cite`)).toBe(6)
    expect(undecidedTail('giá. cite')).toBe(5)
    expect(undecidedTail('Bac')).toBe(0)
    expect(undecidedTail(`mục ${LB}1`)).toBe(3)
    expect(undecidedTail('xong   ')).toBe(3)
    expect(undecidedTail('a\u{1F468}\u{200D}')).toBe(1)
    expect(undecidedTail('Không có gì.')).toBe(0)
  })
  it('a last line without a line break keeps its bytes; a text without a finish frame is settled at the end', async () => {
    expect((await pipe(['d:{"finishReason":"stop"}'])).raw).toBe('d:{"finishReason":"stop"}')
    expect((await pipe([f0('Giá. cite')])).text).toBe('Giá. cite')
  })
})

describe('wired into the chat stream behind CONSULT_LUNA_ONE', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  /** The client's text and the reply text the session keeps, for the same turn. */
  const run = async (frames: string[]) => {
    let kept: string | null = null
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('') + 'd:{"finishReason":"stop"}\n'), 'vi', undefined, undefined, async (ev: { replyText?: string }) => { kept = ev.replyText ?? null })
    const raw = await new Response(res.body).text()
    const text = raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    return { text, kept: kept as string | null, raw }
  }
  it('flag ON: the client text carries no marker, and the session keeps the same text', async () => {
    vi.stubEnv('CONSULT_LUNA_ONE', '1')
    for (const frames of [[f0(M61)], [f0(M61.slice(0, -10)), f0(M61.slice(-10))], [f0(`Xong. ${OPEN}cite${SEP}`), f0('tu')]]) {
      const { text, kept } = await run(frames)
      expect(text).not.toMatch(/cite|turn0/)
      expect(hasPrivateUse(text)).toBe(false)
      expect(kept).toBe(text)
    }
  })
  it('flag OFF: unchanged (the marker passes, as before)', async () => {
    vi.stubEnv('CONSULT_LUNA_ONE', '')
    const { text } = await run([f0(M61)])
    expect(text).toContain('turn0search0')
  })
  it('architecture: the filter has ONE transform, and the response body is that transform piped through the sanitizer', () => {
    const src = readFileSync(join(__dirname, '../streamEnrichment.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export function applyPlaceEnrichmentStreamFilter('))
    expect(fn.match(/new TransformStream/g)).toHaveLength(1)
    expect(fn).toMatch(/const readable = outboundSanitize \? body\.pipeThrough\(transform\)\.pipeThrough\(outboundTextSanitizer\(\)\) : body\.pipeThrough\(transform\)/)
    expect(fn.match(/return new Response\(/g)).toHaveLength(1)
    expect(fn).toMatch(/return new Response\(readable,/)
    expect(fn).toMatch(/replyText: outboundSanitize \? stripModelArtifacts\(keptReply\) : keptReply/)
  })
})
