// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file -- every such code point
// is written as a \u{...} escape.
//
// Idempotence of the output sanitizer (G2 review, package 1). The unified pipeline may put a second filter at the route on top of the
// one in streamEnrichment, so the same text can pass the sanitizer twice. That is only safe when
//   (1) stripModelArtifacts(stripModelArtifacts(x)) === stripModelArtifacts(x), and
//   (2) a stream piped through outboundTextSanitizer twice gives exactly the bytes of piping it once: the same text, the same non-text
//       frames in the same order, `d:` last -- for any way the text is cut into frames and the bytes into network chunks.
// "Exactly" means the contract clients rely on (web useChat, Android reply.append, iOS content += delta all concatenate the text
// deltas): the joined text, the non-text frames byte for byte in the same order, `d:` last, and the text that precedes each non-text
// frame. Where text deltas are cut is not part of it: the second pass sees other cuts and may hold back its own undecided tail
// (trailing spaces, a possible "c..." / open marker) across a frame -- the test bounds that hold to exactly undecidedTail().
// It replaces the scratch check of 15/10 (75 texts, 750 cuts, outside the repo). Deterministic: a fixed-seed generator, no network.
// The recorded live replies (LUNA_ONE_FIXTURES, same folder as scripts/luna-one/replay.test.ts) are an extra, opt-in corpus.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripModelArtifacts, outboundTextSanitizer, undecidedTail } from './outputSanitizer'

const OPEN = '\u{E200}', CLOSE = '\u{E201}', SEP = '\u{E202}'
const LB = '\u{3010}', RB = '\u{3011}', DAGGER = '\u{2020}'
const CITE = `${OPEN}cite${SEP}turn0search0${CLOSE}`
const CITE_MANY = `${OPEN}cite${SEP}turn0search0${SEP}turn1news2${CLOSE}`
const FAMILY = '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'
const RAINBOW = '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}'
const ENGLAND = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'
const TAGS = [...'hidden'].map(ch => String.fromCodePoint(0xe0000 + ch.charCodeAt(0))).join('')

// Replies in the shape Luna writes them: Vietnamese, markdown, tables, links with query strings, prices, hours, emoji.
const BASE = [
  '**Bún bò Huế Đông Ba** — điểm Google Maps 4.5★ với 452 đánh giá, địa chỉ 140 Nguyễn Gia Trí; giờ tra cứu ghi mở đến 00:00.',
  'Giá xăng E5 RON 92 hôm nay là 19.420 đồng/lít, RON 95-III là 20.110 đồng/lít (Nguồn: vnexpress.net).',
  '| Quán | Điểm | Giá |\n|---|---|---|\n| Phở Hòa | 4.4★ | 65.000đ |\n| Phở Lệ | 4.3★ | 70.000đ |\n\nBạn muốn mình chỉ đường không?',
  'Xem [bảng giá vàng](https://vnexpress.net/chu-de/gia-vang-1403?utm=a&b=2) hoặc https://maps.google.com/?cid=12345&hl=vi',
  '1. Sáng: cà phê trứng ở phố cổ\n2. Trưa: bún chả Hương Liên\n3. Tối: dạo hồ Gươm\n\n- Mẹo: đi sớm trước 7:00 cho đỡ đông.',
  `Gia đình ${FAMILY} đi chơi cuối tuần ${RAINBOW} vui lắm ${ENGLAND} \u{1F44D}\u{1F3FD} \u{2764}\u{FE0F} 1\u{FE0F}\u{20E3} \u{1F1FB}\u{1F1F3}`,
  'Bu\u{301}n bo\u{300} Hue\u{302}\u{301} (chữ tách dấu) và chữ dựng sẵn: Huế, Đà Nẵng, Quy Nhơn.',
  'Dòng 1\nDòng 2\r\n\tthụt lề bằng tab\n\n\n',
  '`citeturn` chỉ là chữ trong mã; excite, website, citation, recite đều giữ; Bacciteturn0search0 cũng giữ.',
  `Sản phẩm ${LB}1${RB} bán chạy; ${LB}Hàng chính hãng${RB} Nồi chiên 5L; mục ${LB}12${RB} và ${LB}3:4${RB}. Xem [1] và [2].`,
  'Mình chưa tìm được giá phòng theo ngày bạn chọn — bạn mở link Agoda để xem giá đúng ngày nhé.',
  'Quán mở 6:00–22:00, đóng cửa thứ Hai. Gọi trước: 0236 3 123 456.',
  '',
  'a',
]
// Artifacts the model is known (or expected) to leak, and characters the sanitizer must drop.
const ARTIFACTS = [
  ` ${CITE}`, CITE_MANY, ' citeturn0search0 ', ' citeturn0search0turn0news1 ', ` ${LB}3${DAGGER}source${RB}`, `${LB}4:0${DAGGER}file.pdf${RB}`,
  '\u{202E}txt.exe\u{202C}', '\u{2066}x\u{2069}', '\u{200F}\u{200E}\u{061C}', '\u{200B}\u{200C}\u{2060}\u{FEFF}\u{180E}', TAGS,
  '\u{E123}\u{F0001}', '\u{0}PLAN0\u{0}\u{1}\u{7F}\u{85}', '\u{200D}', `${OPEN}cite${SEP}tu`, OPEN, '  \t ',
]
// Edge cases kept from the scratch check of 15/10 plus the ones it did not have.
const EDGE = [
  `Quán A 4.5★. ${CITE}`, `Xong. ${OPEN}cite${SEP}tu`, 'Giá 27.700 đồng/lít. citeturn0search0', `Theo ${LB}3${DAGGER}source${RB} và ${LB}1${RB}`,
  `Ẩn\u{202E}chữ\u{200B} \u{E0041} x`, `${OPEN}${OPEN}x${CLOSE}${CLOSE}`, `a ${OPEN}${'x'.repeat(250)}${CLOSE} b`, ' cite cite  citeturn ',
  `${CITE}${CITE}${CITE}`, `${LB}${LB}2${DAGGER}a${RB}${RB}`,
  `a\u{200D}${FAMILY}\u{200D}b`, `${ENGLAND}${TAGS}`, `x${CLOSE}y${SEP}z`, '\u{200D}\u{200D}\u{200D}', `${OPEN}`, `${CLOSE}`, '\n\n',
]

function corpus(): string[] {
  const out = [...BASE, ...EDGE]
  BASE.forEach((b, i) => {
    const a = ARTIFACTS[i % ARTIFACTS.length]
    const c = ARTIFACTS[(i * 7 + 3) % ARTIFACTS.length]
    // Inject at a word boundary, where the model puts them: a bare "citeturn..." glued to a letter is a word and is kept on purpose.
    const space = b.indexOf(' ', Math.floor(b.length / 2))
    const mid = space >= 0 ? space + 1 : b.length
    out.push(b + a, a + b, b.slice(0, mid) + c + b.slice(mid), b.slice(0, mid) + a + b.slice(mid) + c)
  })
  return out
}

// Fixed-seed LCG: the same cuts every run, so a failure is reproducible.
function rng(seed: number) {
  let s = seed >>> 0
  return (n: number) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return n <= 0 ? 0 : (s >>> 8) % n }
}

const enc = new TextEncoder()
const NON_TEXT = [
  '9:{"toolCallId":"t1","toolName":"search_places","args":{"q":"bún bò"}}',
  'a:{"toolCallId":"t1","result":{"ok":true}}',
  '8:[{"type":"tappy_progress","step":1}]',
  'f:{"messageId":"m1"}',
]

/** The text cut into `0:` frames at code-point boundaries, with non-text frames between some of them, then `e:` and `d:`. */
function framesFor(text: string, r: (n: number) => number): string[] {
  const cps = Array.from(text)
  const cuts = Array.from({ length: 1 + r(8) }, () => r(cps.length + 1)).sort((a, b) => a - b)
  const frames = [NON_TEXT[3]]
  let from = 0
  for (const c of [...cuts, cps.length]) {
    frames.push('0:' + JSON.stringify(cps.slice(from, c).join('')))
    if (r(4) === 0) frames.push(NON_TEXT[r(3)])
    from = c
  }
  frames.push('e:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}', 'd:{"finishReason":"stop"}')
  return frames.map(f => f + '\n')
}

/** The frames as bytes, cut into network chunks at arbitrary byte offsets (inside a frame or a UTF-8 sequence too). */
function chunksFor(frames: string[], r: (n: number) => number): Uint8Array[] {
  const bytes = enc.encode(frames.join(''))
  const out: Uint8Array[] = []
  let at = 0
  while (at < bytes.length) {
    const n = 1 + r(r(2) === 0 ? 7 : 120)
    out.push(bytes.slice(at, at + n))
    at += n
  }
  return out
}

async function pipe(chunks: Uint8Array[], times: number, logged: Array<Record<string, unknown>> = []): Promise<string> {
  let body: ReadableStream<Uint8Array> = new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(ch); c.close() } })
  for (let i = 0; i < times; i++) body = body.pipeThrough(outboundTextSanitizer(e => { logged.push(e) }))
  return new Response(body).text()
}

function parse(raw: string) {
  const lines = raw.split('\n').filter(Boolean)
  // textBefore[i] = all text emitted before the i-th non-text frame.
  const textBefore: string[] = []
  let text = ''
  for (const l of lines) {
    if (l.startsWith('0:')) text += JSON.parse(l.slice(2)) as string
    else textBefore.push(text)
  }
  return { text, other: lines.filter(l => !l.startsWith('0:')), textBefore, last: lines[lines.length - 1] }
}

async function checkStreams(texts: string[], cutsPerText: number, seed: number) {
  const r = rng(seed)
  const bad: string[] = []
  const badTexts = new Set<string>()
  let runs = 0, heldAcrossFrame = 0, mismatches = 0
  for (const t of texts) {
    for (let k = 0; k < cutsPerText; k++) {
      const frames = framesFor(t, r)
      const chunks = chunksFor(frames, r)
      const logged: Array<Record<string, unknown>> = []
      const [once, twice] = await Promise.all([pipe(chunks, 1, logged), pipe(chunks, 2, logged)])
      mismatches += logged.filter(e => e.kind === 'prefix_mismatch').length
      runs++
      const a = parse(once), b = parse(twice)
      const expectedOther = frames.map(f => f.slice(0, -1)).filter(f => !f.startsWith('0:'))
      // Before each non-text frame, the second pass emits what the first did minus at most the first's undecided tail.
      const orderOk = a.textBefore.every((ab, i) => {
        const bb = b.textBefore[i]
        if (bb !== ab) heldAcrossFrame++
        return bb !== undefined && ab.startsWith(bb) && ab.length - bb.length <= undecidedTail(ab)
      })
      const problems = [
        a.text !== stripModelArtifacts(t) && 'text(once) != strip(whole)',
        b.text !== a.text && 'text(twice) != text(once)',
        JSON.stringify(a.other) !== JSON.stringify(expectedOther) && 'non-text frames changed (once)',
        JSON.stringify(b.other) !== JSON.stringify(a.other) && 'non-text frames changed (twice)',
        (a.last !== 'd:{"finishReason":"stop"}' || b.last !== a.last) && 'd: is not last',
        !orderOk && 'text before a non-text frame moved by more than the undecided tail',
      ].filter(Boolean)
      if (problems.length && !badTexts.has(t)) { badTexts.add(t); bad.push(`${problems.join(', ')} :: ${JSON.stringify(t).slice(0, 80)} :: ${JSON.stringify(frames).slice(0, 160)}`) }
    }
  }
  return { runs, bad, heldAcrossFrame, mismatches }
}

describe('output sanitizer -- idempotence', () => {
  const texts = corpus()

  it('stripModelArtifacts(stripModelArtifacts(x)) === stripModelArtifacts(x) on every corpus text', () => {
    expect(texts.length).toBeGreaterThanOrEqual(80)
    const notIdempotent = texts.filter(t => { const once = stripModelArtifacts(t); return stripModelArtifacts(once) !== once })
    expect(notIdempotent.map(t => JSON.stringify(t).slice(0, 80))).toEqual([])
  })

  it('every injected artifact is gone after one pass (the corpus really exercises the filter)', () => {
    const leftovers = /[\u{E000}-\u{F8FF}\u{F0000}-\u{10FFFF}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{200B}\u{200C}\u{2060}\u{FEFF}\u{0}-\u{8}\u{7F}-\u{9F}]|citeturn\d/u
    const changed = texts.filter(t => stripModelArtifacts(t) !== t)
    expect(changed.length).toBeGreaterThanOrEqual(50)
    for (const t of texts) {
      const out = stripModelArtifacts(t)
      // The one base text that keeps "citeturn" words on purpose (negative cases) is checked for the character classes only.
      const check = /Bacciteturn0search0/.test(t) ? out.replace(/[A-Za-z`]*citeturn[A-Za-z0-9]*/g, '') : out
      expect(leftovers.test(check), JSON.stringify(t).slice(0, 80)).toBe(false)
    }
  })

  it('a stream piped through the sanitizer twice = once: same text (= strip(whole)), same non-text frames in order, d: last', async () => {
    const { runs, bad, heldAcrossFrame, mismatches } = await checkStreams(texts, 12, 0x15102026)
    expect(runs).toBeGreaterThanOrEqual(1000)
    expect(bad).toEqual([])
    expect(mismatches).toBe(0)
    // Measured, not a limit: how often the second pass held its undecided tail across a non-text frame.
    console.info(JSON.stringify({ idempotence_stream_runs: runs, held_across_frame: heldAcrossFrame }))
  }, 60_000)

  it('one frame per character and one byte per chunk (the finest cut) -- same text, d: last', async () => {
    for (const t of texts.filter(x => x.length > 0 && x.length < 400)) {
      const frames = [...Array.from(t).map(c => '0:' + JSON.stringify(c) + '\n'), 'd:{"finishReason":"stop"}\n']
      const bytes = enc.encode(frames.join(''))
      const chunks = Array.from(bytes, b => Uint8Array.of(b))
      const [once, twice] = await Promise.all([pipe(chunks, 1), pipe(chunks, 2)])
      const a = parse(once), b = parse(twice)
      expect(a.text, JSON.stringify(t).slice(0, 60)).toBe(stripModelArtifacts(t))
      expect(b.text, JSON.stringify(t).slice(0, 60)).toBe(a.text)
      expect([a.last, b.last]).toEqual(['d:{"finishReason":"stop"}', 'd:{"finishReason":"stop"}'])
    }
  }, 60_000)
})

// KNOWN GAP GAP-SAN-01 (found by this test, 15/10/2026; not fixed -- a source change needs the owner's approval).
// A marker spliced INSIDE the bare word "cite...turn..." joins the two halves only once the marker is removed:
// stripModelArtifacts(whole) removes both (""), but the stream decides the halves separately: it sends "citeturn0" (or "citet"),
// then the whole no longer starts with what was sent -> prefix_mismatch -> the rest is sanitized piecewise. Result: the client gets
// "citeturn0search0" while replyText (= strip(whole)) is "". Only ASCII leaks (no invisible character); no live reply has had it.
// `it.fails` keeps the suite green while the gap exists and turns RED once it is fixed, so the fix has to flip it on purpose.
const SPLICED = [`c${OPEN}ite${CLOSE}iteturn0search0`, `cite${OPEN}x${CLOSE}turn0search0`]
describe('output sanitizer -- GAP-SAN-01 marker spliced inside "cite...turn"', () => {
  it('the function removes both halves (idempotent)', () => {
    for (const t of SPLICED) { expect(stripModelArtifacts(t)).toBe(''); expect(stripModelArtifacts(stripModelArtifacts(t))).toBe('') }
  })
  it.fails('GAP-SAN-01: the stream equals strip(whole) with no prefix_mismatch', async () => {
    for (const t of SPLICED) {
      const logged: Array<Record<string, unknown>> = []
      const frames = [...Array.from(t).map(c => '0:' + JSON.stringify(c) + '\n'), 'd:{"finishReason":"stop"}\n']
      const out = parse(await pipe([enc.encode(frames.join(''))].flatMap(b => Array.from(b, x => Uint8Array.of(x))), 1, logged))
      expect(out.text).toBe(stripModelArtifacts(t))
      expect(logged.filter(e => e.kind === 'prefix_mismatch')).toEqual([])
    }
  })
})

// Opt-in: the recorded live replies (audit trace `final_out`) of the baseline fixtures. Skipped when LUNA_ONE_FIXTURES is unset.
const DIR = process.env.LUNA_ONE_FIXTURES
describe.skipIf(!DIR)('output sanitizer -- idempotence over the recorded live replies (LUNA_ONE_FIXTURES)', () => {
  it('function and stream idempotence on every final_out', async () => {
    const replies: string[] = []
    for (const f of readdirSync(DIR!).filter(n => n.endsWith('.json'))) {
      const fx = JSON.parse(readFileSync(join(DIR!, f), 'utf8')) as { events: Array<{ type?: string; ev?: string; text?: unknown }> }
      for (const e of fx.events) if (e.type === 'tappyai_audit_trace' && e.ev === 'final_out') replies.push(String(e.text))
    }
    expect(replies.length).toBeGreaterThan(0)
    expect(replies.filter(t => stripModelArtifacts(stripModelArtifacts(t)) !== stripModelArtifacts(t))).toEqual([])
    const { bad } = await checkStreams(replies, 10, 99)
    expect(bad).toEqual([])
  }, 120_000)
})
