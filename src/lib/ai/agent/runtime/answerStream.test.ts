// C2 P2 layer 3 — the runtime stream gate (answerStream.ts): complete lines only, markers never streamed, the line-local cleaning the final
// text gets, the whole-text patterns stop releasing, and the INVARIANT: what was released + the remainder of the final text = the final text.
import { describe, it, expect } from 'vitest'
import { AnswerStreamGate, remainderAfter } from './answerStream'
import { stripTaskFrame, dropMetaNotes, scrubDegenerate, dedupeAroundTaskFrame } from './taskFrame'
import { planCitations } from './evidence'
import { resolveNewsMarkers } from './editorialSources'

function run(deltas: string[], lang = 'vi') {
  const out: string[] = []
  const g = new AnswerStreamGate(t => out.push(t), lang)
  for (const d of deltas) g.push(d)
  return { g, out, released: out.join('') }
}
/** The final text exactly as the loop computes it for a streamed answer (done(): strip → meta notes → scrub, keepFirst once streamed). */
function finalOf(raw: string, lang = 'vi', streamed = true): string {
  const deduped = dedupeAroundTaskFrame(raw, { keepBefore: streamed })
  const t = deduped !== null ? deduped : raw
  return scrubDegenerate(dropMetaNotes(stripTaskFrame(t), lang).text, lang, { keepFirstCopy: streamed }).text
}
const chunksOf = (s: string, n: number) => { const out: string[] = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out }

describe('G0 · the user\'s own script (UAT round 19/10, u03)', () => {
  it('a Thai answer to a Thai question streams in Thai, and the final text keeps it too (released = start of final)', () => {
    const out: string[] = []
    const g = new AnswerStreamGate(t => out.push(t), 'vi', 'วันนี้อากาศที่เมลเบิร์นเป็นยังไง?')
    g.push('เมลเบิร์นตอนนี้ 21°C ท้องฟ้าแจ่มใส\nวันนี้ 13–27°C\n')
    expect(out.join('')).toBe('เมลเบิร์นตอนนี้ 21°C ท้องฟ้าแจ่มใส\nวันนี้ 13–27°C')
    const final = scrubDegenerate('เมลเบิร์นตอนนี้ 21°C ท้องฟ้าแจ่มใส\nวันนี้ 13–27°C', 'vi', { userText: 'วันนี้อากาศที่เมลเบิร์นเป็นยังไง?' }).text
    expect(remainderAfter(final, out.join(''))).toBe('')
  })
  it('with no user text the stray-script rule is as before (Thai letters in a Vietnamese line are removed)', () => {
    const { released } = run(['Trời đẹp ทดสอบ lắm.\nHết.\n'])
    expect(released).not.toMatch(/[฀-๿]/)
  })
})

describe('G1 · what is released', () => {
  it('complete lines only — the line still arriving waits; a released line\'s break leaves once the next line has started with no marker (6.0 + latency follow-up)', () => {
    const { out, g } = run(['Câu một.\n'])
    expect(out).toEqual(['Câu một.']) // the next line has not started: its break is held
    g.push('Câu ')
    expect(out).toEqual(['Câu một.', '\n']) // it started with "C" (not a marker): the break leaves at once
    g.push('hai đang tới.\n')
    expect(out).toEqual(['Câu một.', '\n', 'Câu hai đang tới.'])
  })
  it('latency follow-up: a next line opening with "[" waits for 3 characters — "[S1" keeps the break held, "[li" (a link) lets it go', () => {
    const a = run(['Dòng một.\n', '['])
    expect(a.out).toEqual(['Dòng một.'])
    a.g.push('S1] nguồn')
    expect(a.out).toEqual(['Dòng một.'])
    const b = run(['Dòng một.\n', '['])
    b.g.push('li')
    expect(b.out).toEqual(['Dòng một.', '\n'])
  })
  it('the [TAPPY_TASK] first line never leaves, even split across deltas', () => {
    const { released } = run(['[TAPPY', '_TASK]{"kind":"knowledge","constraints":[],"servings":null,"missing":[]}[/TAPP', 'Y_TASK]\nĐịnh luật Ohm:\n', 'I = U / R.\n'])
    expect(released).not.toMatch(/TAPPY|kind/)
    expect(released).toBe('\nĐịnh luật Ohm:\nI = U / R.')
  })
  it('an unclosed marker holds everything after it until it closes', () => {
    const { out, g } = run(['Mở đầu.\n[TAPPY_TASK]{"kind":', '"chat"', '\n và vẫn chưa đóng\n'])
    // "[TA…" is not a source marker: the break may leave; nothing of the block does
    expect(out).toEqual(['Mở đầu.', '\n'])
    g.push('}[/TAPPY_TASK]\nTiếp.\n')
    expect(g.stopReason()).toBe('task_line_after_text')
  })
  it('a [TAPPY_PLAN] card stops the stream (plan turns are not streamed; this is the belt)', () => {
    const { g, released } = run(['Lịch trình:\n', '[TAPPY_PLAN]{"days":[]}[/TAPPY_PLAN]\n', 'sau thẻ\n'])
    expect(g.stopReason()).toBe('plan_card')
    expect(released).toBe('Lịch trình:')
  })
  it('tool-call lines, end tokens and planning notes are removed line by line; a ``` code block keeps its own calls', () => {
    const { released } = run(['Đây là câu trả lời.\n', '{"name": "search_places", "arguments": {"q": "x"}}\n', 'search_places(query="phở")\n', 'Kết thúc. [END]\n', '(Need final answer exactly, dont output the task line, user question already answered ok)\n', '```js\n', 'search_places("x")\n', '```\n'])
    // (the cleaning trims a line it changed — "Kết thúc. [END]" → "Kết thúc." — exactly as the final text's cleaning does)
    expect(released).toBe('Đây là câu trả lời.\nKết thúc.\n```js\nsearch_places("x")\n```')
  })
  it('the answer written a second time → stop releasing at the repeat', () => {
    const para = 'Hà Nội là thủ đô của Việt Nam với lịch sử hơn một nghìn năm văn hiến và nhiều di tích nổi tiếng khắp nơi.'
    const { g, released } = run([para + '\n', 'Thêm một câu nữa.\n', para + '\n'])
    expect(g.stopReason()).toBe('second_copy')
    expect(released).toBe(para + '\nThêm một câu nữa.')
  })
  it('a task line AFTER text = the answer-twice shape: stop', () => {
    const { g } = run(['Câu trả lời một.\n', '[TAPPY_TASK]{"kind":"chat","constraints":[],"servings":null,"missing":[]}[/TAPPY_TASK]\n'])
    expect(g.stopReason()).toBe('task_line_after_text')
  })
  it('nothing is released after stop()', () => {
    const { g, out } = run(['A.\n'])
    g.stop('error'); g.push('B.\n')
    expect(out).toEqual(['A.'])
  })
})

describe('G2 · INVARIANT: released + remainder = the final text (any chunking)', () => {
  const FRAME = '[TAPPY_TASK]{"kind":"knowledge","constraints":[],"servings":null,"missing":[]}[/TAPPY_TASK]\n'
  const corpus = [
    FRAME + '**Định luật Ohm** cho biết:\n\n- U = I·R\n- I = U/R\n\nVí dụ: U = 6 V, R = 3 Ω thì I = 2 A.',
    FRAME + 'Câu một.\r\nCâu hai.\r\n\r\nĐoạn mới  \nvới khoảng trắng cuối dòng   \n\n\n\nvà nhiều dòng trống.',
    FRAME + 'Trả lời.\n{"name":"x","arguments":{}}\nTiếp tục.\n(Oops dont use weird code; need final exactly task line at end ok)\nHết.',
    'Không có dòng task.\nDòng hai.\n```python\nprint("get_weather(x)")\n```\nSau code.',
    FRAME + 'Hà Nội là thủ đô của Việt Nam với lịch sử hơn một nghìn năm văn hiến và nhiều di tích nổi tiếng.\nThêm ý.\nHà Nội là thủ đô của Việt Nam với lịch sử hơn một nghìn năm văn hiến và nhiều di tích nổi tiếng, viết lại dài hơn nhiều nhiều nhiều lần nữa để bản sau dài hơn bản đầu.',
    FRAME + 'Phần trả lời đầu tiên có đủ hai mươi lăm từ để tính là một phần đáng kể của câu trả lời ở đây nhé bạn ơi thật sự.\n' + FRAME + 'Phần trả lời thứ hai cũng có đủ hai mươi lăm từ để tính là một phần đáng kể của câu trả lời ở đây nhé bạn ơi thật sự dài hơn.',
    FRAME + 'Dòng cuối không có xuống dòng',
    FRAME + 'Văn bản với chữ ngoại lai қәр và ký tự Thái ทดสอบ.\nDòng sau.',
  ]
  for (const [k, raw] of corpus.entries()) {
    for (const n of [1, 3, 7, 40, 10_000]) {
      it(`text #${k}, chunks of ${n}`, () => {
        const { released } = run(chunksOf(raw, n))
        const final = finalOf(raw)
        const rest = remainderAfter(final, released)
        expect(rest, `released=${JSON.stringify(released)} final=${JSON.stringify(final)}`).not.toBeNull()
        // every visible character is identical and in order, and no paragraph break of the final is lost
        const vis = (s: string) => s.replace(/\s+/g, '')
        expect(vis(released + rest!)).toBe(vis(final))
        const breaks = (s: string) => (s.replace(/[ \t\r]+/g, '').match(/\n\n+/g) ?? []).length
        expect(breaks(released + rest!)).toBeGreaterThanOrEqual(breaks(final))
        expect(released).not.toMatch(/TAPPY_TASK|TAPPY_PLAN/)
      })
    }
  }
})

describe('G4 · 6.0 F-1: source markers ([S#] / [N#]) are rewritten after the run — released + remainder = the REWRITTEN final, exactly', () => {
  // the post-run steps, as index.ts runs them (planCitations with no source read removes every [S#]; resolveNewsMarkers renumbers [N#])
  const rewrite = (t: string) => resolveNewsMarkers(planCitations(t, []).text, [{ url: 'https://news.example/a', title: 'Bài', summary: '', source: 'news.example' } as never], 3).text
  const corpus = [
    'Dòng một.\nTheo bài báo [S1] thì giá xăng giảm.\nDòng ba.',
    'Dòng một.\n[S1] mở đầu dòng hai bằng marker.\nDòng ba.',
    'Đoạn một.\n\n[N1] Tin mới về giá xăng.\nHết.',
    'Câu A. Câu B [S2, S3].\nCâu C.',
    'Không có marker nào.\nDòng hai.\nDòng ba',
  ]
  it('a line carrying a marker is never released (the gate stops: source_marker)', () => {
    const { g, released } = run(['Dòng một.\n', 'Theo bài báo [S1] thì giá xăng giảm.\n', 'Dòng ba.\n'])
    expect(g.stopReason()).toBe('source_marker')
    expect(released).toBe('Dòng một.')
  })
  it('a line OPENING with a marker: the line break before it never leaves (planCitations takes that whitespace)', () => {
    const { g, released } = run(['Dòng một.\n', '[S1] mở đầu dòng hai.\n'])
    expect(g.stopReason()).toBe('source_marker')
    expect(released).toBe('Dòng một.')
    const final = rewrite('Dòng một.\n[S1] mở đầu dòng hai.')
    expect(released + remainderAfter(final, released)).toBe(final)
  })
  for (const [k, raw] of corpus.entries()) {
    for (const n of [1, 4, 11, 10_000]) {
      it(`marker text #${k}, chunks of ${n}: released + remainder === rewritten final (byte for byte)`, () => {
        const { released } = run(chunksOf(raw, n))
        const final = rewrite(finalOf(raw))
        const rest = remainderAfter(final, released)
        expect(rest, `released=${JSON.stringify(released)} final=${JSON.stringify(final)}`).not.toBeNull()
        expect(released + rest!).toBe(final)
        expect(released).not.toMatch(/\[[SN]\d/)
      })
    }
  }
})

describe('G3 · remainderAfter', () => {
  it('nothing streamed → the whole final; streamed prefix → the rest; whitespace-run tolerant', () => {
    expect(remainderAfter('Toàn bộ.', '')).toBe('Toàn bộ.')
    expect(remainderAfter('Dòng một.\nDòng hai.', 'Dòng một.\n')).toBe('Dòng hai.')
    // the paragraph break the client lacks is handed back (released ends "\n", the final has "\n\n" → "\n" more)
    expect(remainderAfter('A  b\n\nc', 'A b\n')).toBe('\nc')
    expect(remainderAfter('A b\nc', 'A b\n')).toBe('c')
    expect(remainderAfter('A b', 'A b\n')).toBe('')
    // 6.0: counted in line breaks — released "…dòng   " (its break still held) before the final's "\n\n" gets "\n\n" back
    expect(remainderAfter('dòng\n\nvà', 'dòng   ')).toBe('\n\nvà')
    // 6.0: nothing held back and no break in the final → the final's own spacing ("Dòng một. [S1]" after a held break)
    expect(remainderAfter('Dòng một. [S1] x', 'Dòng một.')).toBe(' [S1] x')
  })
  it('a final that does NOT begin with what streamed → null (the caller sends nothing more)', () => {
    expect(remainderAfter('Một câu khác hẳn.', 'Câu đã gửi.\n')).toBeNull()
  })
})
