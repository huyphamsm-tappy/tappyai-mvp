import { describe, it, expect } from 'vitest'
import { oneBrainMediaStream, SUBJECT_CARD_INTENTS } from './oneBrainMedia'
import { resolveDocMedia, type DocMediaResult } from '@/lib/ai/answerV4/docMedia'
import type { TurnUnderstanding, UnderstandResult } from '@/lib/ai/answerV4/understand'

// 29/10 (25-question run, one brain + pictures): a Wikipedia card explained the setting of the question, not its subject — Sa Pa under a weather / cable-car
// question, Hà Nội and Huế under a train fare, Vietcombank under an exchange rate, Shopee under a shopping comparison, Thủ Đức under a business plan. The
// understanding lists every entity the message mentions; whether the turn is ABOUT them is its own reading of the intent. One brain asks for a card only
// on those intents; the agent runtime (no option) is unchanged.

const U = (over: Partial<TurnUnderstanding>): TurnUnderstanding => ({
  reply_language: 'vi', intent: 'lookup', needs_fresh_data: true, wants_figures: true, sensitivity: 'none', answer_shape: 'explanation', item_kind: 'none',
  entities: [{ name: 'Sa Pa', type: 'place', wiki_title: 'Sa Pa' }], ...over,
})
const ARTICLE = { name: 'Sa Pa', summary: 'Một thị xã.', image: 'https://upload.wikimedia.org/a.jpg', href: 'https://vi.wikipedia.org/wiki/Sa_Pa', source: 'Wikipedia' as const }
const deps = { wiki: async () => ARTICLE, webImages: async () => [] as string[] }

describe('one brain: a subject card only when the turn is about the entity', () => {
  const ONE = { subjectIntents: SUBJECT_CARD_INTENTS }
  it('a lookup, news, planning, shopping or advice turn that merely mentions a place gets no card', async () => {
    for (const intent of ['lookup', 'news', 'planning', 'shopping', 'recommendation', 'advice', 'local_place', 'how_to', 'other', 'chat'] as const) {
      expect((await resolveDocMedia(U({ intent }), 'x', ONE, deps)).block, intent).toBeNull()
    }
  })
  it('a knowledge turn and a comparison keep their card', async () => {
    expect((await resolveDocMedia(U({ intent: 'knowledge' }), 'x', ONE, deps)).block).toMatchObject({ kind: 'entity' })
    expect((await resolveDocMedia(U({ intent: 'comparison' }), 'x', ONE, deps)).block).toMatchObject({ kind: 'entity' })
  })
  it('without the option (the agent runtime) the same lookup turn keeps its card, as before', async () => {
    expect((await resolveDocMedia(U({ intent: 'lookup' }), 'x', {}, deps)).block).toMatchObject({ kind: 'entity' })
  })
  it('the one-brain stream asks for exactly these intents', async () => {
    let asked: ReadonlySet<string> | undefined
    const resolve = async (_u: unknown, _a: string, o: { subjectIntents?: ReadonlySet<string> }): Promise<DocMediaResult> => { asked = o.subjectIntents; return { block: null, annotation: null, webImages: 0, trace: {} } }
    const understanding: UnderstandResult = { u: U({}), ms: 1, usd: 0 } as never
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('0:"x"\nd:{"finishReason":"stop"}\n')); c.close() } })
    await new Response(oneBrainMediaStream(body, { understanding: Promise.resolve(understanding), cardTurn: () => false, resolve: resolve as never })).text()
    expect([...(asked ?? [])].sort()).toEqual(['comparison', 'knowledge'])
  })
})
