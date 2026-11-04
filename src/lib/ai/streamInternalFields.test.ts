// Security audit 04/11 (W-09): tool results reach the browser without the server's working `_tappy_*` fields.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CLIENT_READ_INTERNAL_KEYS, stripInternalFields, stripInternalFrameLine, withoutInternalToolFields } from './streamInternalFields'

describe('stripInternalFields', () => {
  it('removes internal keys at any depth, keeps the ones a client reads and every ordinary key', () => {
    const out = stripInternalFields({
      places: [{ name: 'Quán A', _tappy_constraint_unmet: ['vegan'], _tappy_place: { id: 1 }, rating: 4.5 }],
      _tappy_hard_gaps: ['x'],
      _tappy_shortlist: [{ id: 'a' }],
      note: 'ok',
    })
    expect(out).toEqual({ places: [{ name: 'Quán A', _tappy_place: { id: 1 }, rating: 4.5 }], _tappy_shortlist: [{ id: 'a' }], note: 'ok' })
  })
  it('leaves primitives, null and arrays of primitives alone', () => {
    expect(stripInternalFields(null)).toBeNull()
    expect(stripInternalFields('x')).toBe('x')
    expect(stripInternalFields([1, 'a', null])).toEqual([1, 'a', null])
  })
})

describe('stripInternalFrameLine', () => {
  it('rewrites a tool-result frame, with or without the SSE prefix', () => {
    const frame = 'a:' + JSON.stringify({ toolCallId: 'c1', result: { _tappy_ranking: [1], _tappy_evidence_note: 'internal', n: 2 } })
    expect(JSON.parse(stripInternalFrameLine(frame).slice(2))).toEqual({ toolCallId: 'c1', result: { _tappy_ranking: [1], n: 2 } })
    expect(stripInternalFrameLine('data: ' + frame).startsWith('data: a:')).toBe(true)
  })
  it('passes every other frame, and a frame that is not JSON, through untouched', () => {
    for (const line of ['0:"xin chào _tappy_x"', '9:{"toolCallId":"c","toolName":"search_places","args":{}}', '8:[{"kind":"places"}]', 'e:{"finishReason":"stop"}', 'a:{not json', '']) {
      expect(stripInternalFrameLine(line)).toBe(line)
    }
  })
})

describe('withoutInternalToolFields (the stream)', () => {
  const run = async (chunks: string[]): Promise<string> => {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close() } })
    return new Response(withoutInternalToolFields(new Response(body, { status: 200, headers: { 'x-a': '1' } })).body).text()
  }
  it('filters frames split across chunks, keeps other lines byte for byte, and flushes an unterminated tail', async () => {
    const a = 'a:' + JSON.stringify({ toolCallId: 'c1', result: { _tappy_hard_gaps: ['x'], keep: 1 } })
    const out = await run(['0:"hi"\n', a.slice(0, 20), a.slice(20) + '\n', '0:"đuôi"'])
    const lines = out.split('\n')
    expect(lines[0]).toBe('0:"hi"')
    expect(JSON.parse(lines[1].slice(2))).toEqual({ toolCallId: 'c1', result: { keep: 1 } })
    expect(lines[2]).toBe('0:"đuôi"')
  })
  it('keeps status and headers, and returns a body-less response as it is', async () => {
    const res = withoutInternalToolFields(new Response('0:"x"\n', { status: 207, headers: { 'x-a': '1' } }))
    expect(res.status).toBe(207)
    expect(res.headers.get('x-a')).toBe('1')
    const empty = new Response(null, { status: 204 })
    expect(withoutInternalToolFields(empty)).toBe(empty)
  })
})

describe('the allow-list follows what the clients actually read', () => {
  const root = process.cwd()
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'api' || n === 'node_modules' ? [] : walk(p)
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
  it('every `_tappy_*` key named in client-side code or the recommendation/share/explore libraries is on the list', () => {
    const files = ['src/components', 'src/app', 'src/lib/recommendation', 'src/lib/share', 'src/lib/explore', 'src/lib/tracking'].flatMap(d => walk(join(root, d)))
    const named = new Set<string>()
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/(?<![A-Za-z0-9])(_tappy_[a-z_]+)/g)) named.add(m[1])
    const missing = [...named].filter(k => !CLIENT_READ_INTERNAL_KEYS.has(k))
    expect(missing, 'a client reads these `_tappy_*` keys: add them to CLIENT_READ_INTERNAL_KEYS or the stream will drop them').toEqual([])
  })
  it('the chat route sends its final response through the filter', () => {
    const route = readFileSync(join(root, 'src/app/api/chat/route.ts'), 'utf8')
    expect(route).toContain('const finalResponse = withoutInternalToolFields(')
  })
})
