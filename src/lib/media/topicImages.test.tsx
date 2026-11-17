// 16/11 (owner's fixed pictures): the closed list, the files, the block, the stream, the banner.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { TOPIC_KEYS, TOPIC_IMAGES_AVAILABLE, TOPIC_VARIANTS, isTopicKey, topicImageSrc, pickTopicVariant } from './topicImages'
import { sanitizeMediaBlock, parseMediaBlocks } from './mediaHosts'
import { oneBrainMediaStream } from '@/lib/ai/consultative/oneBrainMedia'
import { TurnUnderstandingSchema, understandTurn, type TurnUnderstanding, type UnderstandResult } from '@/lib/ai/answerV4/understand'
import type { DocMediaResult } from '@/lib/ai/answerV4/docMedia'
import TopicBanner from '@/components/chat/TopicBanner'

const DIR = path.join(process.cwd(), 'public', 'topics')

describe('the owner\'s picture files', () => {
  it('every picture of every topic exists: webp, exactly 1536x512, at most 80 KB; and no stray file sits in the folder', () => {
    const expected = new Set<string>()
    for (const k of TOPIC_KEYS) for (let v = 0; v < TOPIC_VARIANTS[k]; v++) expected.add(topicImageSrc(k, v)!.replace('/topics/', ''))
    expect(new Set(fs.readdirSync(DIR))).toEqual(expected)
    for (const k of TOPIC_IMAGES_AVAILABLE) for (let v = 0; v < TOPIC_VARIANTS[k]; v++) {
      const f = path.join(DIR, topicImageSrc(k, v)!.replace('/topics/', ''))
      expect(fs.existsSync(f), `${k}-${v}`).toBe(true)
      const b = fs.readFileSync(f)
      expect(b.length, k).toBeLessThanOrEqual(80 * 1024)
      expect(b.slice(0, 4).toString(), k).toBe('RIFF')
      expect(b.slice(8, 12).toString(), k).toBe('WEBP')
      const fmt = b.slice(12, 16).toString()
      const dims = fmt === 'VP8 ' ? [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
        : fmt === 'VP8L' ? [(b.readUInt32LE(21) & 0x3fff) + 1, ((b.readUInt32LE(21) >> 14) & 0x3fff) + 1]
        : [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1]
      expect(dims, k).toEqual([1536, 512])
    }
  })
  it('the list is closed: only the eight keys; a key without a file, or anything else, has no picture', () => {
    expect([...TOPIC_KEYS]).toEqual(['gold', 'oil', 'currency', 'stocks', 'crypto', 'growth', 'rates', 'markets'])
    expect(isTopicKey('oil')).toBe(true)
    expect(isTopicKey('weather')).toBe(false)
    expect(isTopicKey(undefined)).toBe(false)
    expect(topicImageSrc('oil')).toBe('/topics/topic-oil.webp')
    expect(topicImageSrc('weather')).toBeNull()
    expect(topicImageSrc('../../etc/passwd')).toBeNull()
    for (const k of TOPIC_KEYS) expect(topicImageSrc(k) !== null, k).toBe(TOPIC_IMAGES_AVAILABLE.has(k))
  })
  it('pictures take turns: the next ones have their own file; a number that does not exist falls back to the first', () => {
    expect(topicImageSrc('currency', 2)).toBe('/topics/topic-currency-2.webp')
    expect(topicImageSrc('gold', 1)).toBe('/topics/topic-gold-1.webp')
    expect(topicImageSrc('growth', 1)).toBe('/topics/topic-growth.webp') // one picture only
    expect(topicImageSrc('oil', 9)).toBe('/topics/topic-oil.webp')
    expect(topicImageSrc('oil', -1)).toBe('/topics/topic-oil.webp')
    expect(topicImageSrc('oil', '../../x')).toBe('/topics/topic-oil.webp')
  })
  it('the pick is spread over the pictures by the random number, and never out of range', () => {
    expect([0, 0.34, 0.67, 0.99].map(r => pickTopicVariant('currency', () => r))).toEqual([0, 1, 2, 2])
    expect([0, 0.49, 0.5, 0.99].map(r => pickTopicVariant('gold', () => r))).toEqual([0, 0, 1, 1])
    expect(pickTopicVariant('growth', () => 0.9)).toBe(0)
    for (const r of [-1, 1, 2, NaN]) expect(pickTopicVariant('currency', () => r)).toBe(0)
  })
})

describe('the media block of a topic', () => {
  it('is kept for a topic with a file, dropped for one without, for an unknown one and for a smuggled field', () => {
    expect(sanitizeMediaBlock({ v: 1, kind: 'topic', topic: 'oil' })).toEqual({ v: 1, kind: 'topic', topic: 'oil' })
    expect(sanitizeMediaBlock({ v: 1, kind: 'topic', topic: 'oil', src: 'https://evil.example/x.png' })).toEqual({ v: 1, kind: 'topic', topic: 'oil' })
    expect(sanitizeMediaBlock({ v: 1, kind: 'topic', topic: 'currency', variant: 2 })).toEqual({ v: 1, kind: 'topic', topic: 'currency', variant: 2 })
    expect(sanitizeMediaBlock({ v: 1, kind: 'topic', topic: 'currency', variant: 7 })).toEqual({ v: 1, kind: 'topic', topic: 'currency' })
    expect(sanitizeMediaBlock({ v: 1, kind: 'topic', topic: 'gold', variant: 'x' })).toEqual({ v: 1, kind: 'topic', topic: 'gold' })
    expect(sanitizeMediaBlock({ v: 1, kind: 'topic', topic: 'weather' })).toBeNull()
    expect(sanitizeMediaBlock({ v: 1, kind: 'topic' })).toBeNull()
  })
  it('travels in the text like every media block and comes back out of it', () => {
    const { text, blocks } = parseMediaBlocks('Giá dầu hôm nay.\n\n[TAPPY_MEDIA]{"v":1,"kind":"topic","topic":"oil"}[/TAPPY_MEDIA]')
    expect(text.trim()).toBe('Giá dầu hôm nay.')
    expect(blocks).toEqual([{ v: 1, kind: 'topic', topic: 'oil' }])
  })
})

describe('the understanding picks the topic from the closed list', () => {
  const BASE = { reply_language: 'vi', intent: 'lookup', needs_fresh_data: true, wants_figures: true, sensitivity: 'none', answer_shape: 'explanation', item_kind: 'none', entities: [] }
  it('the model is asked for it with only the nine values; a caller that does not give it still parses', async () => {
    expect(TurnUnderstandingSchema.safeParse({ ...BASE, topic_visual: 'gold' }).success).toBe(true)
    expect(TurnUnderstandingSchema.safeParse({ ...BASE, topic_visual: 'weather' }).success).toBe(false)
    expect(TurnUnderstandingSchema.safeParse(BASE).success).toBe(false)
    const r = await understandTurn({ userText: 'giá dầu', extract: async () => BASE as unknown as TurnUnderstanding })
    expect(r.u).toMatchObject({ intent: 'lookup' })
    const g = await understandTurn({ userText: 'giá vàng', extract: async () => ({ ...BASE, topic_visual: 'gold' }) as unknown as TurnUnderstanding })
    expect(g.u?.topic_visual).toBe('gold')
  })
})

describe('the stream after the answer', () => {
  const U = (topic?: TurnUnderstanding['topic_visual']): TurnUnderstanding => ({ reply_language: 'vi', intent: 'lookup', needs_fresh_data: true, wants_figures: true, sensitivity: 'none', answer_shape: 'explanation', item_kind: 'none', entities: [], ...(topic ? { topic_visual: topic } : {}) })
  const body = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('0:"Brent 95,84 USD."\nd:{"finishReason":"stop"}\n')); c.close() } })
  const none = async (): Promise<DocMediaResult> => ({ block: null, annotation: null, webImages: 0, trace: {} })
  const run = async (u: TurnUnderstanding, resolve = none, random = () => 0) => new Response(oneBrainMediaStream(body(), { understanding: Promise.resolve({ u, ms: 1, usd: 0 } as UnderstandResult), cardTurn: () => false, resolve: resolve as never, random })).text()
  it('a topic with a picture goes out as a stored media block before the finish frame; "none" and a missing topic send nothing', async () => {
    const out = await run(U('oil'))
    expect(out).toContain('[TAPPY_MEDIA]{\\"v\\":1,\\"kind\\":\\"topic\\",\\"topic\\":\\"oil\\"}[/TAPPY_MEDIA]')
    expect(out.trim().split('\n').at(-1)!.startsWith('d:')).toBe(true)
    expect(await run(U('none'))).not.toContain('TAPPY_MEDIA')
    expect(await run(U())).not.toContain('TAPPY_MEDIA')
    expect(await run(U('gold'))).toContain('\\"topic\\":\\"gold\\"')
    expect(await run(U('currency'))).toContain('\\"topic\\":\\"currency\\"')
  })
  it('which picture of the topic is shown is picked when the answer ends and stored in the block (the first one carries no number)', async () => {
    expect(await run(U('currency'), none, () => 0.9)).toContain('\\"topic\\":\\"currency\\",\\"variant\\":2')
    expect(await run(U('currency'), none, () => 0)).not.toContain('variant')
    expect(await run(U('growth'), none, () => 0.9)).not.toContain('variant')
  })
  it('a turn that already has a subject card keeps the card as its picture, no banner on top of it', async () => {
    const card = async (): Promise<DocMediaResult> => ({ block: { v: 1, kind: 'entity', entity: { name: 'Bitcoin', summary: 'Một đồng tiền số.', href: 'https://vi.wikipedia.org/wiki/Bitcoin', source: 'Wikipedia' } }, annotation: null, webImages: 0, trace: {} })
    const out = await run(U('crypto'), card)
    expect(out).toContain('Bitcoin')
    expect(out).not.toContain('\\"kind\\":\\"topic\\"')
  })
})

describe('the banner', () => {
  it('draws the picture with its text label; an unknown topic draws nothing', () => {
    const h = renderToStaticMarkup(<TopicBanner topic="oil" label="Giá dầu và năng lượng" />)
    expect(h).toContain('/topics/topic-oil.webp')
    expect(h).toContain('alt="Giá dầu và năng lượng"')
    expect(h).toContain('data-topic="oil"')
    expect(renderToStaticMarkup(<TopicBanner topic="currency" variant={2} label="x" />)).toContain('/topics/topic-currency-2.webp')
    expect(renderToStaticMarkup(<TopicBanner topic="weather" label="x" />)).toBe('')
  })
})
