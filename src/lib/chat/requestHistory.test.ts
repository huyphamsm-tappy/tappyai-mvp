import { describe, it, expect, vi, afterEach } from 'vitest'
import { compactRequestMessages, proseOnly, withCompactedHistory, stripUiOnlyFields, REQUEST_HISTORY_BUDGET } from './requestHistory'
import { TEXT_BODY_MAX_BYTES } from '@/lib/http/readCappedBody'
import { validateClientInput } from '@/lib/ai/security/clientInput'

// UAT3 P0 (2026-09-27): a 22-turn thread was ~36 000 characters because assistant turns carried
// their [TAPPY_SHOPPING]/[TAPPY_PLAN] payloads, so every later turn was a 413 ("Mình gặp trục
// trặc…"). The request now carries prose for older assistant turns and stays under the budget.

const shopping = (n: number) => `Okee, mình tìm được! 🔍[TAPPY_SHOPPING]${JSON.stringify({ v: 1, entities: Array.from({ length: n }, (_, i) => ({ key: `k${i}`, name: 'Macbook Pro M1 '.repeat(8) })) })}[/TAPPY_SHOPPING]\n\n**Trong các lựa chọn, mình chọn: Macbook Pro 16in**[FOLLOWUPS]A|B[/FOLLOWUPS]`
const plan = `Kế hoạch nè [TAPPY_PLAN]{"type":"trip","title":"Quy Nhơn","items":[${'{"name":"x"},'.repeat(200)}{"name":"y"}]}[/TAPPY_PLAN]\n**Tóm tắt**`

function longThread(turns: number) {
  const out: { role: string; content: string }[] = []
  for (let i = 0; i < turns; i++) {
    out.push({ role: 'user', content: `câu hỏi số ${i}` })
    out.push({ role: 'assistant', content: i % 2 ? shopping(30) : plan })
  }
  out.push({ role: 'user', content: 'mua máy cũ thì cần check cái gì' })
  return out
}
const size = (ms: { content: unknown }[]) => ms.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0)

describe('proseOnly', () => {
  it('drops every app block and image markdown, keeps the prose', () => {
    const t = proseOnly(`${shopping(2)}\n![ảnh](https://x/y.jpg)[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]`)
    expect(t).toContain('**Trong các lựa chọn, mình chọn: Macbook Pro 16in**')
    expect(t).not.toMatch(/TAPPY_|FOLLOWUPS|CTA_BUTTONS|!\[/)
  })
  it('drops an unclosed block to the end', () => {
    expect(proseOnly('Xin chào [TAPPY_PLAN]{"type":')).toBe('Xin chào')
  })
})

describe('compactRequestMessages', () => {
  it('the measured failure: the raw thread is refused, the compacted one passes', () => {
    const raw = longThread(11)
    expect(size(raw)).toBeGreaterThan(24_000)
    expect(validateClientInput({ messages: raw }).ok).toBe(false)
    const sent = compactRequestMessages(raw)
    expect(size(sent)).toBeLessThanOrEqual(REQUEST_HISTORY_BUDGET)
    expect(validateClientInput({ messages: sent }).ok).toBe(true)
    expect(sent[sent.length - 1]).toEqual({ role: 'user', content: 'mua máy cũ thì cần check cái gì' })
  })

  it('keeps the LAST assistant turn verbatim while it fits, and every user turn', () => {
    const msgs = [
      { role: 'user', content: 'a' }, { role: 'assistant', content: shopping(1) },
      { role: 'user', content: 'b' }, { role: 'assistant', content: shopping(1) },
      { role: 'user', content: 'cái thứ hai' },
    ]
    const out = compactRequestMessages(msgs)
    expect(out[3].content).toBe(shopping(1))
    expect(out[1].content).not.toContain('[TAPPY_SHOPPING]')
    expect(out.filter(m => m.role === 'user').map(m => m.content)).toEqual(['a', 'b', 'cái thứ hai'])
  })

  it('over budget even as prose: drops the oldest turns and never starts on an assistant turn', () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(1500) }))
    msgs.push({ role: 'user', content: 'cuối' })
    const out = compactRequestMessages(msgs)
    expect(size(out)).toBeLessThanOrEqual(REQUEST_HISTORY_BUDGET)
    expect(out[0].role).toBe('user')
    expect(out[out.length - 1].content).toBe('cuối')
  })

  it('handles multi-part (image) user turns without touching the image', () => {
    const img = { type: 'image', image: 'data:image/png;base64,AAAA' }
    const out = compactRequestMessages([{ role: 'user', content: [{ type: 'text', text: 'ảnh này' }, img] }])
    expect((out[0].content as unknown[])[1]).toEqual(img)
  })
})

describe('withCompactedHistory', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('rewrites only `messages` and keeps every other body field', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) => { seen.push(String(init?.body)); return new Response('ok') }))
    await withCompactedHistory('/api/chat', { method: 'POST', body: JSON.stringify({ messages: longThread(11), userLocation: { lat: 1, lng: 2 }, decisionEvidenceId: 'k' }) })
    const body = JSON.parse(seen[0])
    expect(body.userLocation).toEqual({ lat: 1, lng: 2 })
    expect(body.decisionEvidenceId).toBe('k')
    expect(size(body.messages)).toBeLessThanOrEqual(REQUEST_HISTORY_BUDGET)
  })

  // UAT4 P0 (2026-09-27): a 22-turn web thread was a 413 from turn 12 — `parts` repeated every
  // reply raw and every tool invocation carried its full result rows, past the 256 KB ceiling.
  it('drops UI-only parts/toolInvocations/annotations so a long tool-heavy thread stays under the raw ceiling', async () => {
    const rows = Array.from({ length: 8 }, (_, k) => ({ name: `Quán ${k}`, address: 'x'.repeat(600), photo_url: 'https://lh3.example/' + 'p'.repeat(400), reviews: 'r'.repeat(1200) }))
    const thread: Array<Record<string, unknown>> = []
    for (let i = 0; i < 22; i++) {
      thread.push({ role: 'user', content: `câu ${i}`, parts: [{ type: 'text', text: `câu ${i}` }] })
      const reply = `Trả lời ${i}. ` + 'v'.repeat(900) + `[TAPPY_PLACES]${JSON.stringify(rows)}[/TAPPY_PLACES]`
      thread.push({
        role: 'assistant', content: reply, annotations: [{ type: 'tappy.places.v1', items: rows }],
        parts: [{ type: 'text', text: reply }, { type: 'tool-invocation', toolInvocation: { toolName: 'search_places', state: 'result', result: { results: rows } } }],
        toolInvocations: [{ toolName: 'search_places', state: 'result', result: { results: rows } }],
      })
    }
    thread.push({ role: 'user', content: 'ảnh này', experimental_attachments: [{ url: 'data:image/png;base64,AAAA', contentType: 'image/png' }] })
    const raw = JSON.stringify({ messages: thread })
    expect(new TextEncoder().encode(raw).length).toBeGreaterThan(TEXT_BODY_MAX_BYTES) // the measured failure

    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) => { seen.push(String(init?.body)); return new Response('ok') }))
    await withCompactedHistory('/api/chat', { method: 'POST', body: raw })
    const sent = seen[0]
    expect(new TextEncoder().encode(sent).length).toBeLessThan(TEXT_BODY_MAX_BYTES)
    const body = JSON.parse(sent) as { messages: Array<Record<string, unknown>> }
    for (const m of body.messages) for (const k of ['parts', 'toolInvocations', 'annotations']) expect(k in m).toBe(false)
    // The latest user turn keeps its attachment, and the server contract still accepts the body.
    expect(body.messages[body.messages.length - 1].experimental_attachments).toEqual([{ url: 'data:image/png;base64,AAAA', contentType: 'image/png' }])
    expect(validateClientInput(body).ok).toBe(true)
  })

  it('stripUiOnlyFields leaves a message without UI fields as the same object', () => {
    const m = { role: 'user', content: 'x' }
    expect(stripUiOnlyFields(m)).toBe(m)
  })
})
