import { describe, it, expect } from 'vitest'
import { resolveDocMedia } from '@/lib/ai/answerV4/docMedia'
import type { TurnUnderstanding } from '@/lib/ai/answerV4/understand'
import { oneBrainMediaStream } from './oneBrainMedia'
import type { UnderstandResult } from '@/lib/ai/answerV4/understand'
import { renderOptionsMedia } from '@/lib/ai/streamEnrichment'
import { parseMediaBlocks, sanitizeMediaBlock, MAX_MEDIA_OPTIONS } from '@/lib/media/mediaHosts'
import { ONE_BRAIN_CORE, ONE_BRAIN_SHAPE_REMINDER, oneBrainDynamic } from './oneBrain'

// Share run 31/10 (the owner's ChatGPT Think conversation, 38 turns, asked again to Tappy and graded blind). Each block below is one cause of a lost turn.

const U = (over: Partial<TurnUnderstanding>): TurnUnderstanding => ({
  reply_language: 'vi', intent: 'knowledge', needs_fresh_data: false, wants_figures: false, sensitivity: 'none', answer_shape: 'explanation', item_kind: 'none',
  entities: [{ name: 'Claude', type: 'product', wiki_title: null }], ...over,
})
const ALLIGATOR = { name: 'Claude', summary: 'Claude là một con cá sấu bạch tạng tại Học viện Khoa học California.', href: 'https://vi.wikipedia.org/wiki/Claude', source: 'Wikipedia' as const }
const ANSWER = 'Có thể, nếu gửi URL trang công khai và bật Web Search trong Claude. Claude có tính năng web fetch để đọc nội dung từ một URL.'

describe('T38: a subject card of another sense than the answer is not shown (one brain)', () => {
  const ONE = { subjectIntents: new Set<TurnUnderstanding['intent']>(['knowledge']), confirmSense: true }
  it('the check says the card is about something else → no card; it says the same thing → the card', async () => {
    const seen: string[] = []
    const no = await resolveDocMedia(U({}), ANSWER, ONE, { wiki: async () => ALLIGATOR, webImages: async () => [], confirmSense: async (a, cards) => { seen.push(a); return cards.map(() => false) } })
    expect(no.block).toBeNull()
    expect(seen).toEqual([ANSWER]) // the check reads the answer itself
    const yes = await resolveDocMedia(U({}), ANSWER, ONE, { wiki: async () => ALLIGATOR, webImages: async () => [], confirmSense: async (_a, cards) => cards.map(() => true) })
    expect(yes.block).toMatchObject({ kind: 'entity', entity: { name: 'Claude' } })
  })
  it('the check fails or answers the wrong number of cards → no card (a missing card costs less than a wrong one)', async () => {
    const down = await resolveDocMedia(U({}), ANSWER, ONE, { wiki: async () => ALLIGATOR, webImages: async () => [], confirmSense: async () => { throw new Error('down') } })
    expect(down.block).toBeNull()
    const short = await resolveDocMedia(U({}), ANSWER, ONE, { wiki: async () => ALLIGATOR, webImages: async () => [], confirmSense: async () => [] })
    expect(short.block).toBeNull()
  })
  it('in a comparison only the confirmed cards stay', async () => {
    const two = U({ intent: 'knowledge', entities: [{ name: 'Elon Musk', type: 'person', wiki_title: 'Elon Musk' }, { name: 'Claude', type: 'product', wiki_title: null }] })
    const wiki = async (s: string) => (s === 'Claude' ? ALLIGATOR : { name: s, summary: `${s} là doanh nhân.`, href: `https://vi.wikipedia.org/wiki/${s.replace(/ /g, '_')}`, source: 'Wikipedia' as const })
    const r = await resolveDocMedia(two, ANSWER, ONE, { wiki, webImages: async () => [], confirmSense: async (_a, cards) => cards.map(c => c.name !== 'Claude') })
    expect(r.block).toMatchObject({ kind: 'entity', entity: { name: 'Elon Musk' } })
  })
  it('without the option (the agent runtime) nothing is checked, as before', async () => {
    let asked = false
    const r = await resolveDocMedia(U({}), ANSWER, {}, { wiki: async () => ALLIGATOR, webImages: async () => [], confirmSense: async (_a, c) => { asked = true; return c.map(() => false) } })
    expect(asked).toBe(false)
    expect(r.block).toMatchObject({ kind: 'entity' })
  })
  it('the one-brain media stream asks for the check', async () => {
    let opts: { confirmSense?: boolean } | undefined
    const resolve = async (_u: unknown, _a: string, o: { confirmSense?: boolean }) => { opts = o; return { block: null, annotation: null, webImages: 0, trace: {} } }
    const understanding = { u: U({}), ms: 1, usd: 0 } as unknown as UnderstandResult
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('0:"x"\nd:{"finishReason":"stop"}\n')); c.close() } })
    await new Response(oneBrainMediaStream(body, { understanding: Promise.resolve(understanding), cardTurn: () => false, resolve: resolve as never })).text()
    expect(opts?.confirmSense).toBe(true)
  })
})

describe('option cards (owner 31/10, ChatGPT\'s option layout): the block the server emits and the client reads', () => {
  const allowed = new Set(['https://tour.example/a'])
  const raw = (options: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ v: 1, kind: 'options', options, ...extra })
  it('a link this turn gave stays; any other link is dropped and its card stays; the client parses the block back and strips it from the text', () => {
    const out = renderOptionsMedia(raw([{ name: 'Tour A', href: 'https://tour.example/a', linkLabel: 'Đặt tour', highlights: ['Bay thẳng'] }, { name: 'Tour B', href: 'https://lua.example/x', linkLabel: 'Đặt', highlights: [] }], { title: 'Tour Thái' }), allowed)
    expect(out.startsWith('\n\n[TAPPY_MEDIA]')).toBe(true)
    const parsed = parseMediaBlocks(`Câu trả lời.${out}`)
    expect(parsed.text).toBe('Câu trả lời.')
    expect(parsed.blocks).toEqual([{ v: 1, kind: 'options', title: 'Tour Thái', options: [{ name: 'Tour A', highlights: ['Bay thẳng'], href: 'https://tour.example/a', linkLabel: 'Đặt tour' }, { name: 'Tour B', highlights: [] }] }])
    expect(out).not.toContain('lua.example')
  })
  it('nothing usable → no block (missing, malformed, no named option)', () => {
    expect(renderOptionsMedia(undefined, allowed)).toBe('')
    expect(renderOptionsMedia('{not json', allowed)).toBe('')
    expect(renderOptionsMedia(raw([{ name: '  ', highlights: ['x'] }]), allowed)).toBe('')
    expect(renderOptionsMedia(JSON.stringify({ v: 1, kind: 'options' }), allowed)).toBe('')
  })
  it('the client re-check: an unsafe link is dropped, text is cleaned and capped, at most MAX_MEDIA_OPTIONS options', () => {
    const b = sanitizeMediaBlock({ v: 1, kind: 'options', options: [{ name: 'A\u0000B', href: 'javascript:alert(1)', highlights: ['x', 'y', 'z', 'u', 'v', 'w'] }, ...Array.from({ length: 9 }, (_, i) => ({ name: `O${i}`, highlights: [] }))] })
    expect(b?.kind).toBe('options')
    if (b?.kind !== 'options') return
    expect(b.options).toHaveLength(MAX_MEDIA_OPTIONS)
    expect(b.options[0]).toEqual({ name: 'A B', highlights: ['x', 'y', 'z', 'u', 'v'] })
    expect(sanitizeMediaBlock({ v: 1, kind: 'options', options: [{ name: 'A', href: 'http://plain.example/a', highlights: [] }] })).toEqual({ v: 1, kind: 'options', options: [{ name: 'A', highlights: [] }] })
  })
})

describe('the one-brain instruction (share run 31/10)', () => {
  const dyn = (lang: string) => oneBrainDynamic({ lang, now: new Date('2026-10-31T03:00:00Z'), address: null, hasLocation: false, blocks: [] })
  it('T20: the reply language is the latest message\'s, not the app\'s or the earlier turns\'', () => {
    expect(dyn('vi')).toContain("Reply in the language the person's latest message is written in, even when earlier turns used another")
    expect(dyn('vi')).not.toContain('Reply in Vietnamese unless the person writes in another language')
    expect(ONE_BRAIN_CORE).toContain("Reply in the language of the person's LATEST message")
  })
  it('voice: the person\'s own address and register are mirrored; "mình/bạn" is only the default with no cue', () => {
    expect(ONE_BRAIN_CORE).toContain('address the person the way they address you and themselves')
    expect(ONE_BRAIN_CORE).not.toContain('unless they set another way of addressing')
  })
  it('the answer ends on a takeaway, not a question or an offer; option cards are asked for things with no card of their own', () => {
    expect(ONE_BRAIN_CORE).toContain('End on a closing line that lands')
    expect(ONE_BRAIN_SHAPE_REMINDER).not.toContain('offering a deeper angle')
    expect(ONE_BRAIN_CORE).not.toContain('offering the angles the person may want next')
    expect(ONE_BRAIN_CORE).toContain('call present_options')
  })
})
