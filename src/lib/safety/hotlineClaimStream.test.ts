import { describe, it, expect } from 'vitest'
import { hotlineClaimGuardStream } from './hotlineClaimStream'

const enc = new TextEncoder()
const frame = (t: string) => '0:' + JSON.stringify(t) + '\n'

async function run(chunks: string[], onChange?: (r: { removedSentences: number; editedSentences: number }) => void): Promise<string> {
  const rs = new ReadableStream<Uint8Array>({ start(c) { for (const k of chunks) c.enqueue(enc.encode(k)); c.close() } })
  return await new Response(rs.pipeThrough(hotlineClaimGuardStream(onChange))).text()
}
const textOf = (wire: string) => wire.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

describe('hotlineClaimGuardStream', () => {
  it('removes the claim even when the sentence arrives split across many frames', async () => {
    const words = 'Gọi 115 để cấp cứu. Cuộc gọi đến tổng đài 115 miễn phí; tuy nhiên, chi phí xe cứu thương có thể được tính riêng. Hãy nói rõ địa chỉ.'.split(/(?<= )/)
    const seen: Array<{ removedSentences: number }> = []
    const out = await run([...words.map(frame), 'e:{"finishReason":"stop"}\n', 'd:{"finishReason":"stop"}\n'], r => seen.push(r))
    expect(textOf(out)).toBe('Gọi 115 để cấp cứu. Chi phí xe cứu thương có thể được tính riêng. Hãy nói rõ địa chỉ.')
    expect(seen).toEqual([{ removedSentences: 0, editedSentences: 1 }])
    expect(out.endsWith('d:{"finishReason":"stop"}\n')).toBe(true)
  })
  it('a claim split inside a frame boundary ("115 miễn" | " phí") is still seen', async () => {
    const out = await run([frame('Tổng đài 115 miễn'), frame(' phí. Còn lại giữ nguyên.')])
    expect(textOf(out)).toBe('Còn lại giữ nguyên.')
  })
  it('115.000 is not a sentence end', async () => {
    const out = await run([frame('Giá 115.'), frame('000 đồng, miễn phí giao hàng. Xong.')])
    expect(textOf(out)).toBe('Giá 115.000 đồng, miễn phí giao hàng. Xong.')
  })
  it('an answer with no hotline claim is byte for byte the same text, and other frames keep their order', async () => {
    const wire = frame('Xin chào. ') + '9:{"toolCallId":"a"}\n' + frame('Đây là câu trả lời.') + 'e:{"finishReason":"stop"}\n'
    const out = await run([wire])
    expect(out).toBe(frame('Xin chào. ') + '9:{"toolCallId":"a"}\n' + frame('Đây là câu trả lời.') + 'e:{"finishReason":"stop"}\n')
  })
  it('text held back is released before a non-text frame, so the order on the wire is the model\'s', async () => {
    const out = await run([frame('Trước đó. Gọi 115 miễn phí. Sau'), '9:{"x":1}\n', frame(' đó.'), 'd:{}\n'])
    const lines = out.split('\n').filter(Boolean)
    expect(lines.findIndex(l => l.startsWith('9:'))).toBeGreaterThan(lines.findIndex(l => l.includes('Trước đó')))
    expect(textOf(out)).toBe('Trước đó. Sau đó.')
  })
  it('a chunk that cuts a line in two is reassembled', async () => {
    const wire = frame('Gọi 115 miễn phí. Ổn.')
    const out = await run([wire.slice(0, 7), wire.slice(7)])
    expect(textOf(out)).toBe('Ổn.')
  })
  it('a verified number is left alone', async () => {
    const out = await run([frame('Tổng đài 111 miễn phí 24/7. '), frame('Số 112 cũng vậy.')])
    expect(textOf(out)).toBe('Tổng đài 111 miễn phí 24/7. Số 112 cũng vậy.')
  })
})
