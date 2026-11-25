import { describe, it, expect, vi, beforeEach } from 'vitest'
import { moderateVideoAsset, MAX_MODERATION_ATTEMPTS, SPRITE_FILE, AUDIO_FILE, type ModerationDeps } from './moderationStep'
import { decideModeration, type EvidenceItem } from './moderationPolicy'
import { videoModerationAutomatedEnabled } from './flags'
import { memoryStore, uuidIds } from './__fixtures__/memoryStore'
import type { ModerationOutcome } from '@/lib/ai/llm/providers/openaiModeration'
import type { VideoAssetRow } from './uploadFlow'

// AUTOMATED clip moderation (owner 25/11/2026: no human reviewer). A case that would wait for a person is closed by the machine: rejected. The severe case still never publishes.
const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const BUCKET = 'tappyai-video-source-test'
let clock: { now: number }
let mem: ReturnType<typeof memoryStore>
beforeEach(() => { clock = { now: Date.parse('2026-11-05T10:00:00Z') }; mem = memoryStore(clock, uuidIds) })

const CLEAN: ModerationOutcome = { status: 'ok', categories: {}, scores: { sexual: 0, 'sexual/minors': 0, anti_state: 0 } }
const scored = (cat: string, score: number): ModerationOutcome => ({ status: 'ok', categories: { [cat]: score >= 0.6 }, scores: { ...(CLEAN.status === 'ok' ? CLEAN.scores : {}), [cat]: score } })
const DOWN: ModerationOutcome = { status: 'unavailable', reason: 'failed' }

const mod = async (id: string, d: ModerationDeps) => (await moderateVideoAsset(id, d))!

async function moderating(hasAudio = true): Promise<VideoAssetRow> {
  const row = await mem.store.create(OWNER, 'moderation-key-0001')
  await mem.store.setSource(row.id, BUCKET, `vsrc/${OWNER}/abcdefghijklmnopqrstuvwx.mp4`)
  await mem.store.transition(row.id, 'uploading', { eventType: 'upload_session_created', actor: 'u' })
  await mem.store.setMediaInfo(row.id, { durationMs: 60_000, width: 1080, height: 1920, hasAudio })
  await mem.store.transition(row.id, 'uploaded', { eventType: 'upload_verified', actor: 'u' })
  await mem.store.transition(row.id, 'processing', { eventType: 'transcode_requested', actor: 's' })
  await mem.store.transition(row.id, 'moderating', { eventType: 'transcode_succeeded', actor: 's' })
  return (await mem.store.get(row.id))!
}

function deps(a: VideoAssetRow, o: { image?: ModerationOutcome; text?: ModerationOutcome; speechEnabled?: boolean; automated?: boolean } = {}): ModerationDeps {
  const files: Record<string, Uint8Array> = { [`vstg/${OWNER}/${a.id}/${SPRITE_FILE}`]: new Uint8Array([1, 2, 3]), [`vstg/${OWNER}/${a.id}/${AUDIO_FILE}`]: new Uint8Array([4, 5, 6]) }
  return {
    store: mem.store, reader: { async read(k) { return files[k] ?? null } }, consent: { async isAllowed() { return true } },
    moderateImage: vi.fn(async () => o.image ?? CLEAN), moderateText: vi.fn(async () => o.text ?? CLEAN),
    transcribe: vi.fn(async () => ({ status: 'ok' as const, text: 'xin chào các bạn' })),
    overlay: { async textOf() { return [] } }, speechEnabled: o.speechEnabled ?? true, autoRejectEnabled: false, automated: o.automated ?? true,
    attribution: { provider: 'tappy', model: 'vn-filter-1' }, now: () => clock.now,
  }
}

describe('the decision engine in automated mode', () => {
  const ev = (kind: EvidenceItem['kind'], scores: Record<string, number> = {}, status: EvidenceItem['status'] = 'analysed'): EvidenceItem => ({ kind, status, scores, flagged: [] })
  const input = (evidence: EvidenceItem[], automated: boolean) => ({ evidence, required: ['visual', 'speech', 'overlay'] as const, autoRejectEnabled: false, automated })
  it('a clean clip is approved', () => {
    expect(decideModeration({ ...input([ev('visual'), ev('speech'), ev('overlay', {}, 'empty')], true), required: ['visual', 'speech', 'overlay'] }).decision).toBe('approve')
  })
  it('a high score, a borderline score and missing evidence are all REJECTED by the machine (they would otherwise wait for a person)', () => {
    for (const [e, why] of [
      [[ev('visual', { anti_state: 0.8 }), ev('speech'), ev('overlay', {}, 'empty')], 'category_high'],
      [[ev('visual', { gambling: 0.3 }), ev('speech'), ev('overlay', {}, 'empty')], 'category_borderline'],
      [[ev('visual'), ev('speech', {}, 'not_analysed'), ev('overlay', {}, 'empty')], 'evidence_missing:speech'],
    ] as const) {
      const d = decideModeration({ ...input([...e], true), required: ['visual', 'speech', 'overlay'] })
      expect(d).toMatchObject({ decision: 'reject', priority: 'normal', severe: false })
      expect(d.reasonCode).toBe(`auto:${why}`)
    }
  })
  it('the SEVERE case (anything about minors) is never rejected nor approved by the machine: urgent hold, as before', () => {
    const d = decideModeration({ ...input([ev('visual', { 'sexual/minors': 0.5 }), ev('speech'), ev('overlay', {}, 'empty')], true), required: ['visual', 'speech', 'overlay'] })
    expect(d).toMatchObject({ decision: 'review_required', priority: 'urgent', severe: true, reasonCode: 'severe_category' })
  })
  it('with automated OFF nothing changes: the same cases still wait for a person', () => {
    expect(decideModeration({ ...input([ev('visual', { gambling: 0.3 }), ev('speech'), ev('overlay', {}, 'empty')], false), required: ['visual', 'speech', 'overlay'] }).decision).toBe('review_required')
  })
})

describe('the step in automated mode, end to end through the asset store', () => {
  it('a clean clip becomes ready/approved', async () => {
    const a = await moderating()
    expect(await mod(a.id, deps(a))).toMatchObject({ state: 'ready', action: 'decided' })
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'ready', moderation_state: 'approved' })
  })
  it('a clip a person would have had to look at is REJECTED and never published', async () => {
    const a = await moderating()
    expect(await mod(a.id, deps(a, { image: scored('anti_state', 0.7) }))).toMatchObject({ state: 'rejected', action: 'decided' })
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'rejected', moderation_state: 'rejected' })
  })
  it('a clip with sound whose speech cannot be read (transcription off) is rejected, not approved', async () => {
    const a = await moderating(true)
    expect((await mod(a.id, deps(a, { speechEnabled: false }))).state).toBe('rejected')
    const silent = await moderating(false)
    expect((await mod(silent.id, deps(silent, { speechEnabled: false }))).state).toBe('ready') // no sound: nothing to read
  })
  it('a provider that stays down is retried, then the clip is rejected (never approved, never stuck for ever)', async () => {
    const a = await moderating()
    for (let i = 0; i < MAX_MODERATION_ATTEMPTS - 1; i++) {
      expect((await mod(a.id, deps(a, { image: DOWN }))).state).toBe('moderating')
      clock.now += 3 * 60_000
    }
    expect((await mod(a.id, deps(a, { image: DOWN }))).state).toBe('rejected')
  })
  it('a suspected child-safety case stays held (review_required), it is not rejected', async () => {
    const a = await moderating()
    expect((await mod(a.id, deps(a, { image: scored('sexual/minors', 0.5) }))).state).toBe('review_required')
  })
})

describe('the switch', () => {
  it('is ON unless the value is exactly "false"', () => {
    expect(videoModerationAutomatedEnabled({})).toBe(true)
    expect(videoModerationAutomatedEnabled({ VIDEO_MODERATION_AUTOMATED: 'true' })).toBe(true)
    expect(videoModerationAutomatedEnabled({ VIDEO_MODERATION_AUTOMATED: '0' })).toBe(true)
    expect(videoModerationAutomatedEnabled({ VIDEO_MODERATION_AUTOMATED: ' FALSE ' })).toBe(false)
  })
})
