import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from '../streamEnrichment'

// ── 30/10 P0: a live answer stopped mid-way, with no error, after an unowned tail citation ──────────────
//
// Measured on localhost 30/10 (O-DEV30 k2b): Q16 "5 tin kinh tế" — the model wrote 1 753 characters, the user received 227
// ("… một mức kỷ lục mới. "), items 2–5 never arrived; Q22 lost 1 043 of 2 427 the same way. Both ended on ". " and the only guard
// of the turn was the live egress pass.
//
// Mechanism: the live path releases the text up to the `[` of a link still arriving, so the space BEFORE the link is already on the
// wire. Since 1552a18 an unowned citation standing after its sentence goes WHOLE, with the whitespace before it; the filtered text
// then no longer starts with what was released, and `emitLive` / `flushLive` returned without sending anything — for the rest of the turn.
//
// The fix keeps the policy (the unowned link still never leaves) and changes only the release: bytes already sent stay sent, and
// the rest of the FILTERED text is sent after them. These tests pin both halves: the answer is complete, and no unowned URL, nor
// any piece of it, reaches the client — including when the model's text arrives one character at a time.

const text = (s: string) => `0:${JSON.stringify(s)}`
const toolCall = (name: string, id = 't1') => `9:${JSON.stringify({ toolCallId: id, toolName: name, args: { query: 'q' } })}`
const toolResult = (result: unknown, id = 't1') => `a:${JSON.stringify({ toolCallId: id, result })}`
const finish = 'd:{"finishReason":"stop"}'

async function run(lines: string[]): Promise<string> {
  const filtered = applyPlaceEnrichmentStreamFilter(
    new Response(lines.join('\n') + '\n'),
    'vi', undefined, undefined, undefined, undefined, false, '', false, undefined, undefined, [],
  )
  return await new Response(filtered.body).text()
}

const frames = (out: string) =>
  out.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } })
const rendered = (out: string) => frames(out).join('')
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

const GIVEN = 'https://vnexpress.net/kinh-te/tin-hai-4800001.html'
const SEARCH_URL = 'https://www.google.com/search?q=tin+kinh+te'
const UNOWNED = 'https://baodautu.vn/xuat-nhap-khau-vuot-moc-d300001.html'
const EXFIL = 'https://attacker.example/collect?d=QuanBinhThanh_800k'

const searchTurn = () => [
  toolCall('web_search'),
  toolResult({ results: [{ title: 'VnExpress', url: GIVEN, snippet: 'tin hai' }], search_url: SEARCH_URL }),
]

/** The model's text, split the way a stream splits it: the citation arrives in its own deltas after the sentence and its space. */
const Q16 = [
  'Tính đến **30/10/2026**, đây là 5 tin kinh tế Việt Nam đáng chú ý trong tuần:\n\n',
  '1. **Xuất nhập khẩu vượt mốc 1.000 tỷ USD:** đến 29/10 tổng trị giá đã vượt cột mốc này, một mức kỷ lục mới. ',
  '[Báo Đầu tư',
  `](${UNOWNED})`,
  `\n2. **Tin hai:** nội dung tin hai. [VnExpress](${GIVEN})`,
  '\n3. **Tin ba:** nội dung tin ba.',
  '\n4. **Tin bốn:** nội dung tin bốn.',
  '\n5. **Tin năm:** nội dung tin năm.',
]

afterEach(() => vi.restoreAllMocks())

describe('30/10 P0 · an unowned tail citation does not stop the live answer', () => {
  it('Q16 shape: every item after the removed citation reaches the user; the unowned link does not; the given link stays', async () => {
    const out = await run([...searchTurn(), ...Q16.map(text), finish])
    const r = rendered(out)
    expect(r).toContain('1. **Xuất nhập khẩu vượt mốc 1.000 tỷ USD:**')
    expect(r).toContain('2. **Tin hai:** nội dung tin hai.')
    expect(r).toContain(`[VnExpress](${GIVEN})`)
    expect(r).toContain('5. **Tin năm:** nội dung tin năm.')
    expect(r).not.toContain('baodautu')
    expect(r).not.toContain('Báo Đầu tư')
  })

  it('Q22 shape: a paragraph ending in an unowned citation, then more paragraphs', async () => {
    const out = await run([
      ...searchTurn(),
      text('Ngủ đủ giấc giúp cơ thể hồi phục và ổn định tâm trạng. '),
      text('[Sleep Foundation](https://www.sleepfoundation.example/how-sleep-works)'),
      text('\n\n## Thói quen nên có\n\n- Đi ngủ cùng một giờ mỗi tối.\n- Tránh màn hình 1 giờ trước khi ngủ.'),
      text('\n\nNếu mất ngủ kéo dài hơn 3 tuần, nên gặp bác sĩ.'),
      finish,
    ])
    const r = rendered(out)
    expect(r).toContain('## Thói quen nên có')
    expect(r).toContain('Nếu mất ngủ kéo dài hơn 3 tuần, nên gặp bác sĩ.')
    expect(r).not.toContain('sleepfoundation')
  })

  it('several links on one line: two unowned tail citations and a given one in the next sentence', async () => {
    const out = await run([
      ...searchTurn(),
      text('Giá đã tăng 5% trong tuần. '),
      text(`[Nguồn A](${UNOWNED}) `),
      text(`[Nguồn B](${EXFIL})`),
      text(`\nTheo [VnExpress](${GIVEN}), xu hướng còn kéo dài.\nDòng cuối.`),
      finish,
    ])
    const r = rendered(out)
    expect(r).toContain(`Theo [VnExpress](${GIVEN}), xu hướng còn kéo dài.`)
    expect(r).toContain('Dòng cuối.')
    expect(r).not.toContain('baodautu')
    expect(r).not.toContain('attacker.example')
  })

  it('🚨 one character per delta: complete answer, and no frame carries any piece of the unowned URL', async () => {
    const whole = Q16.join('')
    const out = await run([...searchTurn(), ...[...whole].map(text), finish])
    const r = rendered(out)
    expect(r).toContain('5. **Tin năm:** nội dung tin năm.')
    expect(r).not.toContain('baodautu')
    for (const f of frames(out)) expect(f).not.toMatch(/baodautu|xuat-nhap-khau|d300001/)
  })

  it('🚨 an exfiltration link written as a tail citation is still removed, character by character', async () => {
    const whole = `Mình đã tìm xong. [Xem thêm kết quả](${EXFIL})\nCâu tiếp theo vẫn phải tới.`
    const out = await run([...searchTurn(), ...[...whole].map(text), finish])
    const r = rendered(out)
    expect(r).toContain('Câu tiếp theo vẫn phải tới.')
    expect(r).not.toContain('attacker.example')
    expect(r).not.toContain('QuanBinhThanh')
  })

  it('🚨 a bold bare unowned URL (the emphasis goes with it) does not stop the answer either', async () => {
    const out = await run([
      ...searchTurn(),
      text('Xem chi tiết tại **'),
      text(`${EXFIL}** nhé.`),
      text('\nDòng hai vẫn tới.'),
      finish,
    ])
    const r = rendered(out)
    expect(r).toContain('Dòng hai vẫn tới.')
    expect(r).not.toContain('attacker.example')
  })

  it('the words after a removed bold bare URL on the LAST line still arrive (the end of the stream settles the line)', async () => {
    const out = await run([...searchTurn(), text('Xem chi tiết tại **'), text(`${EXFIL}** nhé.`), finish])
    const r = rendered(out)
    expect(r).toContain('nhé.')
    expect(r).not.toContain('attacker.example')
  })

  it('the empty-reply sentence of a live turn that only called tools is sent once, not again at the end of the stream', async () => {
    vi.stubEnv('CONSULT_FINAL_SYNTHESIS', '1')
    try {
      const out = await run([...searchTurn(), 'd:{"finishReason":"tool-calls"}'])
      const r = rendered(out)
      expect(r).toContain('chưa có đủ bằng chứng')
      expect(r.split('chưa có đủ bằng chứng').length - 1).toBe(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('what the user received matches the filtered answer (only whitespace may differ)', async () => {
    const out = await run([...searchTurn(), ...Q16.map(text), finish])
    expect(squash(rendered(out))).toBe(squash([
      'Tính đến **30/10/2026**, đây là 5 tin kinh tế Việt Nam đáng chú ý trong tuần:',
      '1. **Xuất nhập khẩu vượt mốc 1.000 tỷ USD:** đến 29/10 tổng trị giá đã vượt cột mốc này, một mức kỷ lục mới.',
      `2. **Tin hai:** nội dung tin hai. [VnExpress](${GIVEN})`,
      '3. **Tin ba:** nội dung tin ba.',
      '4. **Tin bốn:** nội dung tin bốn.',
      '5. **Tin năm:** nội dung tin năm.',
    ].join('\n')))
  })

  it('a citation that only LOOKED like a tail (more words follow on its line) keeps its label, with no doubled text', async () => {
    const out = await run([
      ...searchTurn(),
      text('Giá vàng tăng. '),
      text(`[Báo Đầu tư](${UNOWNED})`),
      text(' cho biết mức tăng là 2%.\nHết.'),
      finish,
    ])
    expect(rendered(out)).toBe('Giá vàng tăng. Báo Đầu tư cho biết mức tăng là 2%.\nHết.')
  })

  it('an answer with no removed link is released exactly as before (byte for byte)', async () => {
    const parts = ['Câu một. ', `Theo [VnExpress](${GIVEN}), ổn.`, '\nCâu ba.']
    const out = await run([...searchTurn(), ...parts.map(text), finish])
    expect(rendered(out)).toBe(parts.join(''))
  })

  it('the resume is logged (counts only, no text), so a rewrite of released bytes is never silent again', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await run([...searchTurn(), ...Q16.map(text), finish])
    const lines = log.mock.calls.map(c => String(c[0])).filter(s => s.includes('live_prefix_resumed'))
    expect(lines.length).toBeGreaterThan(0)
    const j = JSON.parse(lines[0]) as Record<string, unknown>
    expect(j).toMatchObject({ type: 'tappyai_guard', guard: 'live_prefix_resumed' })
    expect(typeof j.dropped).toBe('number')
    expect(JSON.stringify(j)).not.toContain('kỷ lục')
  })
})
