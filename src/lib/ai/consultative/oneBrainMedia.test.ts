import { describe, it, expect } from 'vitest'
import { oneBrainMediaStream } from './oneBrainMedia'
import type { UnderstandResult } from '@/lib/ai/answerV4/understand'
import type { DocMediaResult } from '@/lib/ai/answerV4/docMedia'

const U: UnderstandResult = { u: { reply_language: 'vi', intent: 'knowledge', needs_fresh_data: false, wants_figures: false, sensitivity: 'none', answer_shape: 'explanation', item_kind: 'none', entities: [{ name: 'Chiến dịch X', type: 'event', wiki_title: 'X' }] }, ms: 5, usd: 0.0001 }
const ENTITY = { v: 1 as const, kind: 'entity' as const, entity: { name: 'Chiến dịch X', summary: 'Một sự kiện.', image: 'https://upload.wikimedia.org/a.jpg', href: 'https://vi.wikipedia.org/wiki/X', source: 'Wikipedia' } }
const body = (lines: string[]) => new ReadableStream<Uint8Array>({ start(c) { const e = new TextEncoder(); for (const l of lines) c.enqueue(e.encode(l)); c.close() } })
const read = async (s: ReadableStream<Uint8Array>) => new Response(s).text()
const ANSWER = ['0:"Mở đầu. "\n', '0:"Phần hai."\n', 'e:{"finishReason":"stop"}\n', 'd:{"finishReason":"stop"}\n']

describe('oneBrainMediaStream', () => {
  it('passes the answer through and puts the subject card and the item pictures BEFORE the finish frame; the resolver reads the whole answer', async () => {
    let seen = ''
    const resolve = async (_u: unknown, answer: string): Promise<DocMediaResult> => {
      seen = answer
      return { block: ENTITY as never, annotation: { kind: 'tappy.doc_media.v1', v: 1, items: [{ title: 'Món A', src: 'https://upload.wikimedia.org/b.jpg', source: 'wikipedia' }] }, webImages: 0, trace: {} }
    }
    const logs: Array<Record<string, unknown>> = []
    const out = await read(oneBrainMediaStream(body(ANSWER), { understanding: Promise.resolve(U), cardTurn: () => false, resolve: resolve as never, log: l => logs.push(l) }))
    expect(seen).toBe('Mở đầu. Phần hai.')
    const lines = out.trim().split('\n')
    expect(lines.slice(0, 3)).toEqual(['0:"Mở đầu. "', '0:"Phần hai."', 'e:{"finishReason":"stop"}'])
    expect(JSON.parse(lines[3].slice(2))).toContain('[TAPPY_MEDIA]')
    expect(lines[4].startsWith('8:')).toBe(true)
    expect(lines[5]).toBe('d:{"finishReason":"stop"}')
    expect(logs[0]).toMatchObject({ type: 'tappyai_one_brain_media', block: 'entity', item_images: 1 })
  })
  it('a card turn asks for no item pictures', async () => {
    let skipItems: boolean | undefined
    const resolve = async (_u: unknown, _a: string, o: { skipItems?: boolean }): Promise<DocMediaResult> => { skipItems = o.skipItems; return { block: null, annotation: null, webImages: 0, trace: {} } }
    await read(oneBrainMediaStream(body(ANSWER), { understanding: Promise.resolve(U), cardTurn: () => true, resolve: resolve as never }))
    expect(skipItems).toBe(true)
  })
  it('no understanding, an error or the deadline: the answer and the finish frame exactly as they came, no picture', async () => {
    const plain = ANSWER.join('')
    expect(await read(oneBrainMediaStream(body(ANSWER), { understanding: Promise.resolve({ u: null, ms: 1, usd: 0, error: 'x' }), cardTurn: () => false }))).toBe(plain)
    const boom = async (): Promise<DocMediaResult> => { throw new Error('boom') }
    expect(await read(oneBrainMediaStream(body(ANSWER), { understanding: Promise.resolve(U), cardTurn: () => false, resolve: boom as never }))).toBe(plain)
    const slow = () => new Promise<DocMediaResult>(r => setTimeout(() => r({ block: ENTITY as never, annotation: null, webImages: 0, trace: {} }), 200))
    const logs: Array<Record<string, unknown>> = []
    expect(await read(oneBrainMediaStream(body(ANSWER), { understanding: Promise.resolve(U), cardTurn: () => false, resolve: slow as never, deadlineMs: 20, log: l => logs.push(l) }))).toBe(plain)
    expect(logs[0]).toMatchObject({ skipped: 'deadline' })
  })
  it('a line split across chunks is decoded whole; an invalid media block is dropped', async () => {
    const split = ['0:"Mở ', 'đầu."\n', 'd:{"finishReason":"stop"}\n']
    let seen = ''
    const resolve = async (_u: unknown, a: string): Promise<DocMediaResult> => { seen = a; return { block: { v: 1, kind: 'entity', entity: { name: 'x', image: 'javascript:alert(1)' } } as never, annotation: null, webImages: 0, trace: {} } }
    const out = await read(oneBrainMediaStream(body(split), { understanding: Promise.resolve(U), cardTurn: () => false, resolve: resolve as never }))
    expect(seen).toBe('Mở đầu.')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('TAPPY_MEDIA')
  })
})
