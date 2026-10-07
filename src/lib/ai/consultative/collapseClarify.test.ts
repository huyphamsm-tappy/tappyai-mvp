import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { collapseClarifyTurns, mergeClarifyAnswer, isClarifyReply, CLARIFY_JOIN } from './actionability'

// ─────────────────────────────────────────────────────────────────────────────
// THE MODEL NEVER SEES AN ANSWERED CANNED CLARIFY.
//
// Android E2E 2026-09-19 (session 2, GPS at the emulator default): canned clarify →
// chip "dưới 100k/người" → the model asked "Bạn muốn ăn gì?" (no search) →
// "quan an ngon o phu nhuan, co cho dau xe hoi" → asked again → "khach san gan
// san bay tan son nhat" → asked a third time, in the canned clarify's own format
// ("Để gợi ý đúng ý, mình cần biết: • Mấy người?"). The example it copied was
// the canned assistant turn in its history. `collapseClarifyTurns` is what
// route.ts feeds the model: every answered clarify is folded into the request
// as one complete user message; the UI transcript keeps the real thread.
// ─────────────────────────────────────────────────────────────────────────────

const CLARIFY = 'Để chọn đúng chỗ, mình cần biết thêm:\n• Tầm giá? (dưới 100k/người / 100–200k/người / trên 200k/người)\n• Mấy người? (1–2 người / 3–5 người / nhóm đông)\nBạn trả lời phần nào cũng được, phần còn lại mình tự giả sử và nói rõ.'
const u = (content: string) => ({ role: 'user', content })
const a = (content: string) => ({ role: 'assistant', content })

describe('collapseClarifyTurns — the model-facing thread', () => {
  it('the E2E shape: request + canned clarify + answer ⇒ one user message, no assistant question', () => {
    const out = collapseClarifyTurns([u('an gi ngon gio'), a(CLARIFY), u('dưới 100k/người')])
    expect(out).toEqual([u('an gi ngon gio' + CLARIFY_JOIN + 'dưới 100k/người')])
    expect(out.some(m => m.role === 'assistant')).toBe(false)
  })

  it('identical to what mergeClarifyAnswer builds for the deterministic readers', () => {
    const ms = [u('an gi ngon gio'), a(CLARIFY), u('dưới 100k/người')]
    expect(collapseClarifyTurns(ms)).toEqual(mergeClarifyAnswer(ms))
  })

  it('later turns: the collapsed clarify stays gone — a second clarify in a row is unreachable as an example', () => {
    const ms = [
      u('an gi ngon gio'), a(CLARIFY), u('dưới 100k/người'),
      a('Mình chọn **Béo Ơi Quán** — bún chả Hà Nội, 50–100k.'),
      u('quan an ngon o phu nhuan, co cho dau xe hoi'),
    ]
    const out = collapseClarifyTurns(ms)
    expect(out.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(out[0].content).toBe('an gi ngon gio' + CLARIFY_JOIN + 'dưới 100k/người')
    expect(out.filter(m => m.role === 'assistant' && isClarifyReply(String(m.content)))).toHaveLength(0)
  })

  it('an unanswered clarify (last message) is kept — nothing to fold it into', () => {
    const ms = [u('an gi ngon gio'), a(CLARIFY)]
    expect(collapseClarifyTurns(ms)).toEqual(ms)
  })

  it('an ordinary assistant reply is never collapsed, even when it asks something', () => {
    const ms = [u('quán phở ngon quận 1'), a('Mình chọn **Phở Nhất Vị**. Bạn muốn biết thêm về quán nào không?'), u('quán đầu tiên')]
    expect(collapseClarifyTurns(ms)).toEqual(ms)
  })

  it('a parts-array answer (a photo attached) is left alone — only string turns fold', () => {
    const ms = [u('an gi ngon gio'), a(CLARIFY), { role: 'user', content: [{ type: 'text', text: 'dưới 100k' }] }]
    expect(collapseClarifyTurns(ms)).toEqual(ms)
  })

  it('route.ts feeds the model the collapsed thread — the wiring, not just the helper', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toMatch(/const modelMessages = compactHistory\(collapseClarifyTurns\(trimmedMessages\)/)
    // The memory extractor still summarises the raw thread.
    expect(route).toContain('still uses raw `trimmedMessages`')
  })
})
