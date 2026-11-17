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
  it('15/11: two named things in a LOOKUP (two oil benchmarks) are not a comparison: no side-by-side cards; a real comparison keeps them', async () => {
    const two = [{ name: 'Brent', type: 'concept' as const, wiki_title: 'Brent' }, { name: 'WTI', type: 'concept' as const, wiki_title: 'WTI' }]
    const wiki = async (n: string) => ({ ...ARTICLE, name: n, href: `https://vi.wikipedia.org/wiki/${n}` })
    const d = { wiki, webImages: async () => [] as string[] }
    for (const shape of ['explanation', 'chat', 'table'] as const) expect((await resolveDocMedia(U({ intent: 'lookup', answer_shape: shape, entities: two }), 'x', {}, d)).block, shape).toBeNull()
    expect((await resolveDocMedia(U({ intent: 'comparison', answer_shape: 'comparison', entities: two }), 'x', {}, d)).block).toMatchObject({ kind: 'entities' })
  })
  it('15/11: a Vietnamese reader gets the Vietnamese article when the lookup fell back to English and the same article exists in Vietnamese; otherwise the English one stays', async () => {
    const en = { name: 'BYD Company', summary: 'BYD Company Limited is a Chinese conglomerate.', href: 'https://en.wikipedia.org/wiki/BYD_Company', source: 'Wikipedia' as const }
    const vi = { name: 'BYD Auto', summary: 'BYD Auto là hãng xe Trung Quốc.', href: 'https://vi.wikipedia.org/wiki/BYD_Auto', source: 'Wikipedia' as const }
    const one = [{ name: 'BYD', type: 'organization' as const, wiki_title: null }]
    const wiki = async (s: string, l: string) => (l === 'vi' && s === 'BYD Auto' ? vi : l === 'vi' ? en : null)
    const withLink = await resolveDocMedia(U({ intent: 'knowledge', entities: one }), 'x', {}, { wiki, webImages: async () => [], langlink: async () => 'BYD Auto' })
    expect(withLink.block).toMatchObject({ kind: 'entity', entity: { href: 'https://vi.wikipedia.org/wiki/BYD_Auto' } })
    const noLink = await resolveDocMedia(U({ intent: 'knowledge', entities: one }), 'x', {}, { wiki, webImages: async () => [], langlink: async () => null })
    expect(noLink.block).toBeNull() // 16/11: an English-only article gives a Vietnamese reader no card (its words would be English)
  })
  it('18/11 (UAT 60 q16): a how-to about a DISH shows the dish, in steps shape too; a how-to that names a place or a concept still gets no card', async () => {
    const dish = [{ name: 'Bún riêu cua', type: 'dish' as const, wiki_title: null }]
    const wiki = async (n: string) => ({ ...ARTICLE, name: n, href: 'https://vi.wikipedia.org/wiki/B%C3%BAn_ri%C3%AAu' })
    const d = { wiki, webImages: async () => [] as string[], confirmSense: async (_a: string, cards: readonly unknown[]) => cards.map(() => true) }
    for (const shape of ['steps', 'explanation'] as const) {
      expect((await resolveDocMedia(U({ intent: 'how_to', answer_shape: shape, entities: dish }), 'x', ONE, d)).block, shape).toMatchObject({ kind: 'entity' })
    }
    // the dish alongside a place: only the dish is what the recipe is about, one card
    const mixed = [...dish, { name: 'Hà Nội', type: 'place' as const, wiki_title: 'Hà Nội' }]
    expect((await resolveDocMedia(U({ intent: 'how_to', answer_shape: 'steps', entities: mixed }), 'x', ONE, d)).block).toMatchObject({ kind: 'entity', entity: { name: 'Bún riêu cua' } })
    // not a dish: no card, as before
    for (const type of ['place', 'concept', 'product', 'organization'] as const) {
      expect((await resolveDocMedia(U({ intent: 'how_to', answer_shape: 'steps', entities: [{ name: 'X', type, wiki_title: null }] }), 'x', ONE, d)).block, type).toBeNull()
    }
    // a dish in a LOOKUP (not a how-to) keeps being left out of the one-brain card
    expect((await resolveDocMedia(U({ intent: 'lookup', answer_shape: 'explanation', entities: dish }), 'x', ONE, d)).block).toBeNull()
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
