// @vitest-environment node
// Phase 8 — the three defects of the live UAT-10 turn (uat10-e2e-answer-first-2026-10-09), reproduced with the RECORDED reply text:
//   D1 a bold product name that no evidence of the turn contains ("iPhone 18 Pro Max"; the results only had "iPhone 18 Pro");
//   D2 a question inside the advice written before the lookup, plus the closing invitation (two questions);
//   D3 the criteria written before the lookup restated after it.
// Checked on the final TEXT and on the runtime that composes it — not on prompt strings. D3 is only partly decidable by code (see the
// last test): near-verbatim echoes are removed deterministically; a paraphrase is not, and that stays the instruction's job.
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { groundEntityNames, looksLikeModelName, nameVariants } from './entityNameGuard'
import { composeFinal, withoutQuestions } from './agent/runtime/answerFirst'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './agent/runtime/loop'
import { AgentRunTrace } from './agent/runtime/trace'
import { ASK_USER } from './agent/runtime/controlTools'

const PREFACE = 'Để cân bằng pin, camera và dùng lâu dài, nên xem ba thứ: thời lượng pin trong bài đánh giá thực tế (không chỉ dung lượng), chất lượng camera chính lẫn camera góc rộng/zoom, và cam kết cập nhật phần mềm cùng khả năng sửa chữa, thay pin.\n\nCác ưu tiên này có thể đánh đổi nhau: máy chụp tốt thường xử lý ảnh và màn hình tốn pin hơn; máy pin bền chưa chắc có camera linh hoạt. Khi so hai mẫu cụ thể, hãy đối chiếu cùng phiên bản bộ nhớ và chú ý giá thay pin, thời gian cập nhật bảo mật, cùng chính sách bảo hành. Hệ điều hành bạn quen dùng cũng có thể ảnh hưởng lựa chọn; bạn đang cân nhắc hai mẫu nào?'
const FINAL = 'Nếu chọn hai mẫu đại diện để so, mình sẽ đặt **Galaxy S26 Ultra** cạnh **iPhone 18 Pro Max**: cả hai thuộc nhóm cao cấp, nhưng ưu tiên khác nhau. Lưu ý đây là lựa chọn đại diện vì bạn chưa nêu tên hai mẫu hay ngân sách cụ thể.\n\n- **Pin:** so thời lượng sử dụng thực tế trong bài kiểm tra cùng điều kiện; dung lượng pin riêng lẻ không đủ để kết luận máy nào trụ lâu hơn.\n- **Dùng lâu dài:** kiểm tra thời gian cập nhật hệ điều hành/bảo mật, khả năng thay pin và chính sách sửa chữa. Samsung công bố **Galaxy S26 series có 7 năm cập nhật bảo mật**; đây là căn cứ hữu ích cho tiêu chí sử dụng lâu dài.\n\nMình chưa có dữ liệu đã xác minh đủ để kết luận mẫu nào pin lâu hơn hoặc camera tốt hơn trong cặp này. Nếu bạn gửi đúng hai mẫu đang cân nhắc, mình sẽ so trực tiếp theo ba tiêu chí trên; ngân sách cũng giúp chọn được cặp sát nhu cầu hơn.'
// what the lookup of that turn actually returned (titles/snippets, trimmed): iPhone 18 Pro (not Pro Max), a ranking snippet naming
// iPhone 17 Pro Max / Galaxy S26 Ultra / Pixel 10 Pro, and Samsung's official 7-year statement
const RESULTS = JSON.stringify({ source: 'Google (Serper)', results: [
  { title: 'Mua iPhone 18 Pro 256GB Bạc - Giáo Dục - Apple (VN)', link: 'https://www.apple.com/vn-edu/shop/buy-iphone/iphone-18-pro', snippet: 'Mới. Mua sắm iPhone 18 Pro. Giới hạn hai iPhone 18 Pro và hai iPhone 18 Pro ...' },
  { title: 'Bảng xếp hạng smartphone 2026', link: 'https://hoanganhmobile.com/top', snippet: 'Cập nhật bảng xếp hạng smartphone 2026 – top điện thoại tốt nhất hiện nay. So sánh iPhone 17 Pro Max, Galaxy S26 Ultra, Pixel 10 Pro…' },
  { title: 'Samsung ra mắt Galaxy S26 series', link: 'https://news.samsung.com/vn/samsung-ra-mat-galaxy-s26-series', snippet: 'Với 7 năm cập nhật bảo mật, Galaxy S26 series giúp duy trì các lớp bảo vệ bền vững theo thời gian.' },
] })

describe('D1 · a model name no evidence contains', () => {
  it('looksLikeModelName: model-like bold runs yes; amounts, units, labels, brands, section words no', () => {
    for (const yes of ['iPhone 18 Pro Max', 'Galaxy S26 Ultra', 'Pixel 10 Pro', 'Samsung Galaxy S26 Ultra 256GB']) expect(looksLikeModelName(yes), yes).toBe(true)
    for (const no of ['20 triệu', '5000mAh', 'Ngày 2', 'Top 3', 'Bước 1', 'Pin:', 'Apple', 'Samsung Galaxy', 'Cập nhật bảo mật', 'Galaxy S26 series có 7 năm cập nhật bảo mật vượt trội so với đối thủ']) expect(looksLikeModelName(no), no).toBe(false)
  })
  it('nameVariants: leading brand and trailing capacity are tolerated, a different model is not', () => {
    expect(nameVariants('Samsung Galaxy S26 Ultra 256GB')).toEqual(expect.arrayContaining(['galaxy s26 ultra']))
    expect(nameVariants('iPhone 18 Pro Max')).not.toContain('iphone 18 pro')
  })
  it('the recorded reply: "iPhone 18 Pro Max" is disclosed, "Galaxy S26 Ultra" (in a retrieved snippet) and the sourced 7-year claim are untouched; no advice is deleted', () => {
    const r = groundEntityNames(FINAL, { corpus: [RESULTS], userTexts: ['So sánh hai mẫu điện thoại phù hợp với người ưu tiên pin, camera và dùng lâu dài. Hãy giải thích tiêu chí chọn.'] })
    expect(r.ungrounded).toEqual(['iPhone 18 Pro Max'])
    expect(r.text).toContain('iPhone 18 Pro Max (mình chưa thấy tên này trong nguồn đã tra)')
    expect(r.text).not.toContain('**iPhone 18 Pro Max**')
    expect(r.text).toContain('**Galaxy S26 Ultra**')
    expect(r.text).toContain('Samsung công bố **Galaxy S26 series có 7 năm cập nhật bảo mật**')
    expect(r.text.replace(' (mình chưa thấy tên này trong nguồn đã tra)', '').replace('iPhone 18 Pro Max', '**iPhone 18 Pro Max**')).toBe(FINAL)
  })
  it('a name the user typed, or one the results contain only with a leading brand / capacity, is supported', () => {
    const t = 'Mình sẽ so **Samsung Galaxy S26 Ultra** với **iPhone 17 Pro Max 512GB**.'
    expect(groundEntityNames(t, { corpus: [RESULTS], userTexts: [] }).ungrounded).toEqual([])
    expect(groundEntityNames('So **Pixel 9 Pro** nhé', { corpus: [RESULTS], userTexts: ['mình đang phân vân Pixel 9 Pro'] }).ungrounded).toEqual([])
  })
  it('no tool evidence → nothing is judged (stable-knowledge answers are never touched)', () => {
    expect(groundEntityNames(FINAL, { corpus: [], userTexts: [] })).toMatchObject({ text: FINAL, ungrounded: [], checked: 0 })
  })
  it('through the REAL settle path (agent collector): the recorded final reply comes out disclosed, with the plain gate behaviour unchanged for the rest', async () => {
    const collector = createEnrichmentCollector('So sánh hai mẫu điện thoại phù hợp với người ưu tiên pin, camera và dùng lâu dài. Hãy giải thích tiêu chí chọn.')
    collector.agentMode = true
    collector.semanticRanking = true
    const frames = [
      '9:{"toolCallId":"t1","toolName":"web_search","args":{"queries":["điện thoại pin camera 2026"]}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result: JSON.parse(RESULTS) }),
      '0:' + JSON.stringify(FINAL),
      'd:{"finishReason":"stop"}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, 'So sánh hai mẫu điện thoại phù hợp với người ưu tiên pin, camera và dùng lâu dài.', false)
    const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
    const text = lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    expect(text).toContain('iPhone 18 Pro Max (mình chưa thấy tên này trong nguồn đã tra)')
    expect(text).toContain('Galaxy S26 Ultra')
    expect(text).toContain('7 năm cập nhật bảo mật')
  })
})

describe('D2 · at most ONE question, at the end', () => {
  it('withoutQuestions: a question sentence goes, a "statement; question?" keeps its statement, structure is untouched', () => {
    expect(withoutQuestions('Một ý hợp lý. Bạn muốn gì?')).toBe('Một ý hợp lý.')
    expect(withoutQuestions('Hệ điều hành bạn quen dùng cũng có thể ảnh hưởng lựa chọn; bạn đang cân nhắc hai mẫu nào?')).toBe('Hệ điều hành bạn quen dùng cũng có thể ảnh hưởng lựa chọn.')
    expect(withoutQuestions('[FOLLOWUPS]A|B?[/FOLLOWUPS]')).toBe('[FOLLOWUPS]A|B?[/FOLLOWUPS]')
  })
  it('the recorded turn: the preface question is gone, its statement stays, and the reply has no mid-answer question', () => {
    const out = composeFinal([PREFACE], FINAL)
    expect(out).not.toContain('bạn đang cân nhắc hai mẫu nào?')
    expect(out).toContain('Hệ điều hành bạn quen dùng cũng có thể ảnh hưởng lựa chọn.')
    expect(out).toContain('Để cân bằng pin, camera và dùng lâu dài')
    expect((out.match(/\?/g) ?? []).length).toBe(0)
    // the single closing invitation of the post-lookup text remains the last thing the user reads
    expect(out.trim().endsWith('sát nhu cầu hơn.')).toBe(true)
  })
  it('runtime: advice + question written by the check, final with ONE closing question → exactly one "?" and it is the last sentence', async () => {
    const steps: RuntimeStep[] = [
      { text: '', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, toolCalls: [{ toolCallId: 'c1', toolName: 'web_search', args: { queries: ['x'] } }] },
      { text: 'Kết quả tra cứu cho thấy Galaxy S26 Ultra có 7 năm cập nhật. Bạn có đang dùng iPhone không?', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, toolCalls: [] },
    ]
    const input: RuntimeInput = {
      system: 'S', messages: [{ role: 'user', content: 'u' }], tools: { web_search: { execute: async () => ({ results: [] }) } } as never,
      schemas: { web_search: {}, [ASK_USER]: {} }, callModel: async () => steps.shift()!,
      answerFirstModel: async () => ({ text: PREFACE }), deadlineAt: Date.now() + 85_000, lang: 'vi',
      trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
    }
    const run = await runAgentRuntime(input)
    expect(run.answerFirst).toBe('provided')
    expect((run.text.match(/\?/g) ?? []).length).toBe(1)
    expect(run.text.trim().endsWith('không?')).toBe(true)
    expect(run.text).toContain('Hệ điều hành bạn quen dùng')
  })
})

describe('D3 · criteria already shown are not shown again', () => {
  it('a final sentence that echoes ONE preface sentence near-verbatim is removed; new evidence in the same text stays', () => {
    const pre = 'Hãy so sánh pin và camera ở cùng một điều kiện thử nghiệm. Nên cân thời lượng pin thực tế trong bài đánh giá độc lập, không chỉ dung lượng ghi trên giấy.'
    const final = 'Nên cân thời lượng pin thực tế trong bài đánh giá độc lập, không chỉ dung lượng ghi trên giấy. Samsung công bố 7 năm cập nhật bảo mật cho Galaxy S26.'
    const out = composeFinal([pre], final)
    expect(out.match(/thời lượng pin thực tế/g)).toHaveLength(1)
    expect(out).toContain('Hãy so sánh pin và camera')
    expect(out).toContain('Samsung công bố 7 năm cập nhật bảo mật cho Galaxy S26.')
  })
  it('list lines keep their bullet and their new sentences; a line made only of an echo disappears', () => {
    const pre = 'Hãy thử máy ở cửa hàng trước khi mua. Camera: so ảnh thiếu sáng, chân dung và khả năng zoom trong cùng điều kiện chụp.'
    const final = ['- Camera: so ảnh thiếu sáng, chân dung và khả năng zoom trong cùng điều kiện chụp.', '- **Cập nhật:** Samsung nêu 7 năm bảo mật cho dòng S26.'].join('\n')
    const out = composeFinal([pre], final)
    expect(out.match(/chân dung/g)).toHaveLength(1)
    expect(out).toContain('- **Cập nhật:** Samsung nêu 7 năm bảo mật cho dòng S26.')
    expect(out).not.toMatch(/^- Camera:/m)
  })
  it('LIMIT (documented, not hidden): a PARAPHRASE of the preface cannot be detected by code and is left to the instruction', () => {
    const out = composeFinal([PREFACE], FINAL)
    expect(out).toContain('**Pin:** so thời lượng sử dụng thực tế') // the recorded paraphrase survives deterministic dedupe
  })
  it('a failed final step still delivers the advice (no generic apology), and a tool failure keeps it', async () => {
    const steps: RuntimeStep[] = [
      { text: '', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, toolCalls: [{ toolCallId: 'c1', toolName: 'web_search', args: { queries: ['x'] } }] },
    ]
    const input: RuntimeInput = {
      system: 'S', messages: [{ role: 'user', content: 'u' }], tools: { web_search: { execute: async () => { throw new Error('boom') } } } as never,
      schemas: { web_search: {}, [ASK_USER]: {} }, callModel: async o => { if (o.final || steps.length === 0) throw new Error('model down'); return steps.shift()! },
      answerFirstModel: async () => ({ text: 'Tiêu chí nên cân là pin thực tế, camera thiếu sáng và thời gian cập nhật.' }), deadlineAt: Date.now() + 85_000, lang: 'vi',
      trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
    }
    const run = await runAgentRuntime(input)
    expect(run.text).toContain('Tiêu chí nên cân là pin thực tế')
    expect(run.text).not.toMatch(/Xin lỗi, mình chưa trả lời được/)
  })
})
