import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readCappedBody, exceedsTextCeiling, RAW_BODY_MAX_BYTES, TEXT_BODY_MAX_BYTES } from './readCappedBody'

// UAT3 D2: /api/chat refuses an oversized RAW body before parsing it.

const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request('http://localhost/api/chat', { method: 'POST', body, headers })

/** A body streamed in chunks with no Content-Length — the case a header check alone misses. */
function streamed(totalBytes: number, chunk = 64 * 1024) {
  let sent = 0
  let pulls = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      pulls++
      if (sent >= totalBytes) return c.close()
      const n = Math.min(chunk, totalBytes - sent)
      sent += n
      c.enqueue(new Uint8Array(n).fill(0x61))
    },
  })
  return { req: new Request('http://localhost/api/chat', { method: 'POST', body: stream, duplex: 'half' } as RequestInit), pulls: () => pulls }
}

describe('readCappedBody', () => {
  it('reads a normal body', async () => {
    const r = await readCappedBody(post(JSON.stringify({ messages: [{ role: 'user', content: 'xin chào' }] })))
    expect(r).toEqual({ ok: true, text: '{"messages":[{"role":"user","content":"xin chào"}]}' })
  })

  it('refuses on the declared Content-Length without reading', async () => {
    expect(await readCappedBody(post('{}', { 'content-length': String(RAW_BODY_MAX_BYTES + 1) }))).toEqual({ ok: false, reason: 'too_large' })
  })

  it('stops reading a streamed body at the ceiling — it never buffers the rest', async () => {
    const s = streamed(20 * 1024 * 1024)
    const r = await readCappedBody(s.req, 1024 * 1024)
    expect(r).toEqual({ ok: false, reason: 'too_large' })
    expect(s.pulls()).toBeLessThan(40) // ~17 chunks of 64 KB reach 1 MB, not the 320 of the full body
  })
})

describe('exceedsTextCeiling', () => {
  const big = 'x'.repeat(TEXT_BODY_MAX_BYTES + 10)
  it('a text-only body over 256 KB is refused', () => {
    expect(exceedsTextCeiling(JSON.stringify({ messages: [{ role: 'user', content: big }] }))).toBe(true)
  })
  it('a body carrying a photo may be larger (the image budget applies)', () => {
    expect(exceedsTextCeiling(JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'text', text: 'ảnh' }, { type: 'image', image: `data:image/jpeg;base64,${big}` }] }] }))).toBe(false)
  })
  it('a normal long thread is far below it', () => {
    expect(exceedsTextCeiling(JSON.stringify({ messages: Array.from({ length: 100 }, () => ({ role: 'user', content: 'ư'.repeat(280) })) }))).toBe(false)
  })
})

describe('/api/chat reads the body only through the ceiling', () => {
  it('no req.json() is left in the route, and the ceiling runs before JSON.parse', () => {
    const src = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(src).not.toMatch(/\breq\.json\(\)/)
    expect(src.indexOf('readCappedBody(req)')).toBeGreaterThan(0)
    expect(src.indexOf('readCappedBody(req)')).toBeLessThan(src.indexOf('JSON.parse(capped.text)'))
  })
})
