import { describe, it, expect, vi, beforeEach } from 'vitest'
import { moderateVideoAsset, MAX_MODERATION_ATTEMPTS, MODERATION_RETRY_BACKOFF_MS, CSAM_HOLD_DAYS, SPRITE_FILE, AUDIO_FILE, type ModerationDeps } from './moderationStep'
import { memoryStore, uuidIds } from './__fixtures__/memoryStore'
import type { ModerationOutcome } from '@/lib/ai/llm/providers/openaiModeration'
import type { TranscribeOutcome } from '@/lib/ai/llm/providers/openaiTranscribe'
import type { VideoAssetRow } from './uploadFlow'

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const BUCKET = 'tappyai-video-source-test'

let clock: { now: number }
let mem: ReturnType<typeof memoryStore>
beforeEach(() => { clock = { now: Date.parse('2026-11-05T10:00:00Z') }; mem = memoryStore(clock, uuidIds) })

const CLEAN: ModerationOutcome = { status: 'ok', categories: { sexual: false, violence: false }, scores: { sexual: 0.001, violence: 0.002, 'sexual/minors': 0.0001 } }
const withScore = (cat: string, score: number, flagged = false): ModerationOutcome => ({ status: 'ok', categories: { [cat]: flagged }, scores: { ...CLEAN.status === 'ok' ? CLEAN.scores : {}, [cat]: score } })
const DOWN: ModerationOutcome = { status: 'unavailable', reason: 'http_error' }

/** A video in `moderating` as the transcoder step leaves it. */
async function moderating(over: { hasAudio?: boolean } = {}): Promise<VideoAssetRow> {
  const row = await mem.store.create(OWNER, 'moderation-key-0001')
  await mem.store.setSource(row.id, BUCKET, `vsrc/${OWNER}/abcdefghijklmnopqrstuvwx.mp4`)
  await mem.store.transition(row.id, 'uploading', { eventType: 'upload_session_created', actor: 'u' })
  await mem.store.setMediaInfo(row.id, { durationMs: 60_000, width: 1080, height: 1920, hasAudio: over.hasAudio ?? true })
  await mem.store.transition(row.id, 'uploaded', { eventType: 'upload_verified', actor: 'u' })
  await mem.store.transition(row.id, 'processing', { eventType: 'transcode_requested', actor: 's' })
  await mem.store.transition(row.id, 'moderating', { eventType: 'transcode_succeeded', actor: 's' })
  return (await mem.store.get(row.id))!
}

interface Plan {
  consent?: boolean | Error
  files?: Record<string, Uint8Array | null | Error>
  image?: ModerationOutcome | Array<ModerationOutcome>
  text?: ModerationOutcome | ((texts: string[]) => ModerationOutcome)
  speech?: TranscribeOutcome
  overlay?: string[] | Error
  speechEnabled?: boolean
  autoReject?: boolean
}
function build(plan: Plan = {}) {
  const sprite = (a: VideoAssetRow) => `vstg/${OWNER}/${a.id}/${SPRITE_FILE}`
  const audio = (a: VideoAssetRow) => `vstg/${OWNER}/${a.id}/${AUDIO_FILE}`
  const calls = { image: 0, text: [] as string[][], transcribe: 0, read: [] as string[], consent: 0 }
  const images = Array.isArray(plan.image) ? [...plan.image] : null
  const mk = (a: VideoAssetRow): ModerationDeps => ({
    store: mem.store,
    reader: {
      async read(key) {
        calls.read.push(key)
        const files = plan.files ?? { [sprite(a)]: new Uint8Array([1, 2, 3]), [audio(a)]: new Uint8Array([4, 5, 6]) }
        const f = key in files ? files[key] : null
        if (f instanceof Error) throw f
        return f ?? null
      },
    },
    consent: { async isAllowed() { calls.consent++; if (plan.consent instanceof Error) throw plan.consent; return plan.consent ?? true } },
    moderateImage: vi.fn(async () => { calls.image++; return images ? (images.length > 1 ? images.shift()! : images[0]) : ((plan.image as ModerationOutcome) ?? CLEAN) }),
    moderateText: vi.fn(async (texts: string[]) => { calls.text.push(texts); const t = plan.text ?? CLEAN; return typeof t === 'function' ? t(texts) : t }),
    transcribe: vi.fn(async () => { calls.transcribe++; return plan.speech ?? { status: 'ok' as const, text: 'xin chào các bạn' } }),
    overlay: { async textOf() { if (plan.overlay instanceof Error) throw plan.overlay; return plan.overlay ?? [] } },
    speechEnabled: plan.speechEnabled ?? true,
    autoRejectEnabled: plan.autoReject ?? false,
    now: () => clock.now,
  })
  return { mk, calls }
}
const run = async (a: VideoAssetRow, plan: Plan = {}) => { const b = build(plan); const r = await moderateVideoAsset(a.id, b.mk(a)); return { r, ...b } }

describe('approval', () => {
  it('a clean clip (frames, speech, overlay all under the low threshold) goes to ready WITH approved, and the decision is audited', async () => {
    const a = await moderating()
    const { r, calls } = await run(a, { overlay: ['Quán ngon quá'] })
    expect(r).toMatchObject({ assetId: a.id, state: 'ready', action: 'decided' })
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'ready', moderation_state: 'approved' })
    expect(mem.moderationResults).toHaveLength(1)
    const rec = mem.moderationResults[0]
    expect(rec).toMatchObject({ assetId: a.id, decision: 'approve', reasonCode: 'all_clear', provider: 'openai', policyVersion: 'vmod-1', csam: false, holdUntil: null, actor: 'service:video-moderation' })
    expect(rec.model).toContain('omni-moderation-latest+')
    expect(rec.transcript).toBe('xin chào các bạn')
    expect(rec.evidence).toMatchObject({ visual: { status: 'analysed', key: `vstg/${OWNER}/${a.id}/${SPRITE_FILE}` }, speech: { status: 'analysed', transcriptChars: 16 }, overlay: { status: 'analysed', count: 1 } })
    expect(calls.image).toBe(1)
    expect(calls.text).toEqual([['Quán ngon quá'], ['xin chào các bạn']])
  })

  it('a clip with NO audio never touches the audio file or the transcriber, and speech is not required', async () => {
    const a = await moderating({ hasAudio: false })
    const { r, calls } = await run(a)
    expect(r?.state).toBe('ready')
    expect(calls.transcribe).toBe(0)
    expect(calls.read).toEqual([`vstg/${OWNER}/${a.id}/${SPRITE_FILE}`])
    expect(mem.moderationResults[0].evidence).toMatchObject({ speech: { status: 'empty', reason: 'no_audio' } })
  })

  it('silence / music (an empty transcript) is analysed as nothing said, not as a problem', async () => {
    const a = await moderating()
    const { r, calls } = await run(a, { speech: { status: 'ok', text: '' } })
    expect(r?.state).toBe('ready')
    expect(calls.text).toEqual([]) // no text, nothing to moderate
  })

  it('gunshots / screams / thunder are not a topic: only the transcript is ever classified, never the sound', async () => {
    const a = await moderating()
    const { calls } = await run(a)
    expect(calls.read).toContain(`vstg/${OWNER}/${a.id}/${AUDIO_FILE}`) // read for transcription only
    // the only inputs the moderation provider ever receives are the sprite (image) and TEXT
    expect(calls.image).toBe(1)
    for (const t of calls.text) for (const piece of t) expect(typeof piece).toBe('string')
  })
})

describe('speech switched off', () => {
  it('a clip with audio is NOT approved, the transcriber is never called, the audio is not even read, and a person is asked', async () => {
    const a = await moderating()
    const { r, calls } = await run(a, { speechEnabled: false })
    expect(r).toMatchObject({ state: 'review_required', action: 'decided' })
    expect(calls.transcribe).toBe(0)
    expect(calls.read).toEqual([`vstg/${OWNER}/${a.id}/${SPRITE_FILE}`])
    expect(mem.moderationResults[0]).toMatchObject({ decision: 'review_required', reasonCode: 'evidence_missing:speech', priority: 'normal' })
    expect(mem.moderationResults[0].evidence).toMatchObject({ speech: { status: 'not_analysed', reason: 'speech_transcription_off' } })
  })

  it('a silent clip is unaffected by the switch', async () => {
    const a = await moderating({ hasAudio: false })
    expect((await run(a, { speechEnabled: false })).r?.state).toBe('ready')
  })
})

describe('🚨 AI consent comes before any provider call', () => {
  it('without consent: nothing is read or sent, the video stays in moderating, one no_ai_consent event, no failure and no attempt counted', async () => {
    const a = await moderating()
    const { r, calls } = await run(a, { consent: false })
    expect(r).toMatchObject({ state: 'moderating', action: 'no_consent' })
    expect(calls.read).toEqual([])
    expect(calls.image).toBe(0)
    expect(calls.text).toEqual([])
    expect(calls.transcribe).toBe(0)
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'moderating', moderation_attempts: 0 })
    expect(mem.moderationResults).toHaveLength(0)
    await run(a, { consent: false })
    await run(a, { consent: false })
    expect(mem.events.filter(e => e.eventType === 'no_ai_consent')).toHaveLength(1)
  })

  it('a consent that cannot be read counts as no consent (fail closed)', async () => {
    const a = await moderating()
    const { r, calls } = await run(a, { consent: new Error('db down') })
    expect(r).toMatchObject({ state: 'moderating', action: 'no_consent' })
    expect(calls.image + calls.transcribe).toBe(0)
  })

  it('once the owner agrees, the same video is moderated normally', async () => {
    const a = await moderating()
    await run(a, { consent: false })
    expect((await run(a, { consent: true })).r?.state).toBe('ready')
  })
})

describe('anything doubtful goes to a person; the AI never rejects by default', () => {
  it('a high score in the frames -> review_required (high), with category and confidence', async () => {
    const a = await moderating()
    const { r } = await run(a, { image: withScore('violence', 0.93) })
    expect(r?.state).toBe('review_required')
    expect(mem.rows.get(a.id)).toMatchObject({ moderation_state: 'review_required' })
    expect(mem.moderationResults[0]).toMatchObject({ decision: 'review_required', category: 'violence', priority: 'high', reasonCode: 'category_high' })
    expect(mem.moderationResults[0].confidence).toBeCloseTo(0.93, 4)
  })

  it('a problem only in the SPEECH transcript or only in the overlay text is found', async () => {
    const a = await moderating()
    expect((await run(a, { text: withScore('hate', 0.8) })).r?.state).toBe('review_required')
    expect(mem.moderationResults[0].evidence).toMatchObject({ speech: { status: 'analysed' } })
  })

  it('a missing sprite sheet -> review_required (evidence missing), never approved', async () => {
    const a = await moderating()
    const { r } = await run(a, { files: { [`vstg/${OWNER}/${a.id}/${AUDIO_FILE}`]: new Uint8Array([1]) } })
    expect(r?.state).toBe('review_required')
    expect(mem.moderationResults[0].reasonCode).toContain('evidence_missing:visual')
  })

  it('an answer without scores cannot be weighed: not evidence, so no approval', async () => {
    const a = await moderating()
    const { r } = await run(a, { image: { status: 'ok', categories: { sexual: false } } })
    expect(r?.state).toBe('review_required')
    expect(mem.moderationResults[0].evidence).toMatchObject({ visual: { status: 'not_analysed', reason: 'no_scores' } })
  })

  it('even a certain violation is NOT rejected while auto-reject is off ...', async () => {
    const a = await moderating()
    expect((await run(a, { image: withScore('sexual', 0.999) })).r?.state).toBe('review_required')
  })

  it('... and is rejected only when it is switched on (a clear, non-severe category)', async () => {
    const a = await moderating()
    const { r } = await run(a, { image: withScore('sexual', 0.999), autoReject: true })
    expect(r?.state).toBe('rejected')
    expect(mem.rows.get(a.id)).toMatchObject({ moderation_state: 'rejected' })
    expect(mem.moderationResults[0]).toMatchObject({ decision: 'reject', reasonCode: 'auto_reject_clear_violation' })
  })
})

describe('🚨 suspected child-safety content is never decided by the AI', () => {
  it('urgent review, csam_suspected, a legal hold in the future, no approve / reject, even with auto-reject on', async () => {
    const a = await moderating()
    const { r } = await run(a, { image: withScore('sexual/minors', 0.5), autoReject: true })
    expect(r).toMatchObject({ state: 'review_required', action: 'decided' })
    expect(mem.moderationResults[0]).toMatchObject({ decision: 'review_required', priority: 'urgent', category: 'sexual/minors', csam: true, reasonCode: 'severe_category' })
    expect(mem.events.some(e => e.id === a.id && e.eventType === 'csam_suspected')).toBe(true)
    expect(Date.parse(mem.holds.get(a.id)!)).toBe(clock.now + CSAM_HOLD_DAYS * 86_400_000)
  })

  it('also when only the speech or the overlay text says it', async () => {
    const a = await moderating()
    await run(a, { text: withScore('sexual/minors', 0.5) })
    expect(mem.moderationResults[0]).toMatchObject({ priority: 'urgent', csam: true })
  })

  it('no further automated action: a second run changes nothing and writes nothing', async () => {
    const a = await moderating()
    await run(a, { image: withScore('sexual/minors', 0.5) })
    const events = mem.events.length
    const again = await run(a)
    expect(again.r).toMatchObject({ state: 'review_required', action: 'none' })
    expect(mem.moderationResults).toHaveLength(1)
    expect(mem.events.length).toBe(events)
  })
})

describe('provider trouble: stay in moderating, retry later, then a person', () => {
  it('a failed image check keeps the video in moderating, counts the attempt, and does NOT pay for a transcription', async () => {
    const a = await moderating()
    const { r, calls } = await run(a, { image: DOWN })
    expect(r).toMatchObject({ state: 'moderating', action: 'waiting' })
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'moderating', moderation_attempts: 1 })
    expect(calls.transcribe).toBe(0)
    expect(mem.moderationResults).toHaveLength(0)
  })

  it('a transcription that does not answer is retried; a storage error too', async () => {
    const a = await moderating()
    expect((await run(a, { speech: { status: 'unavailable', reason: 'spend_refused' } })).r?.action).toBe('waiting')
    clock.now += MODERATION_RETRY_BACKOFF_MS + 1
    expect((await run(a, { files: { [`vstg/${OWNER}/${a.id}/${SPRITE_FILE}`]: new Error('gcs 503') } })).r?.action).toBe('waiting')
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'moderating', moderation_attempts: 2 })
  })

  it('inside the back-off window nothing is read or sent', async () => {
    const a = await moderating()
    await run(a, { image: DOWN })
    clock.now += MODERATION_RETRY_BACKOFF_MS - 1000
    const { r, calls } = await run(a)
    expect(r?.action).toBe('waiting')
    expect(calls.read).toEqual([])
    expect(calls.image).toBe(0)
  })

  it('after the back-off the retry can succeed', async () => {
    const a = await moderating()
    await run(a, { image: DOWN })
    clock.now += MODERATION_RETRY_BACKOFF_MS + 1
    expect((await run(a)).r?.state).toBe('ready')
  })

  it('🚨 when the attempts are used up, review_required (never approved, never rejected), reason says the provider was unavailable', async () => {
    const a = await moderating()
    for (let i = 0; i < MAX_MODERATION_ATTEMPTS; i++) {
      const { r } = await run(a, { image: DOWN })
      if (i < MAX_MODERATION_ATTEMPTS - 1) expect(r?.action).toBe('waiting')
      else expect(r).toMatchObject({ state: 'review_required', action: 'decided' })
      clock.now += MODERATION_RETRY_BACKOFF_MS + 1
    }
    expect(mem.moderationResults).toHaveLength(1)
    expect(mem.moderationResults[0].reasonCode).toMatch(/^provider_unavailable:/)
    expect(mem.moderationResults[0].decision).toBe('review_required')
  })

  it('a failing overlay source is provider-side trouble too (retry), not a silent skip', async () => {
    const a = await moderating()
    expect((await run(a, { overlay: new Error('db') })).r?.action).toBe('waiting')
  })
})

describe('idempotence and scope', () => {
  it('🚨 two concurrent runs write ONE decision', async () => {
    const a = await moderating()
    const b1 = build(); const b2 = build()
    const [x, y] = await Promise.all([moderateVideoAsset(a.id, b1.mk(a)), moderateVideoAsset(a.id, b2.mk(a))])
    expect(mem.moderationResults).toHaveLength(1)
    expect(mem.events.filter(e => e.id === a.id && e.eventType === 'moderation_approve')).toHaveLength(1)
    expect([x?.state, y?.state]).toEqual(['ready', 'ready'])
  })

  it('a run after the decision is a no-op', async () => {
    const a = await moderating()
    await run(a)
    const again = await run(a, { image: withScore('sexual', 0.99) })
    expect(again.r).toMatchObject({ state: 'ready', action: 'none' })
    expect(again.calls.image).toBe(0)
    expect(mem.moderationResults).toHaveLength(1)
  })

  it('only `moderating` is moderated; an unknown id answers null', async () => {
    const row = await mem.store.create(OWNER, 'moderation-key-0002')
    const { r, calls } = await run(row)
    expect(r).toMatchObject({ state: 'draft', action: 'none' })
    expect(calls.consent).toBe(0)
    expect(await moderateVideoAsset('nope', build().mk(row))).toBeNull()
  })

  it('a long transcript is cut into pieces for the provider and every piece is judged', async () => {
    const a = await moderating()
    const long = 'a'.repeat(17_000)
    const { r, calls } = await run(a, { speech: { status: 'ok', text: long } })
    expect(r?.state).toBe('ready')
    expect(calls.text[0].map(p => p.length)).toEqual([8000, 8000, 1000])
  })

  it('a transcript too long to judge completely is not approved', async () => {
    const a = await moderating()
    const { r } = await run(a, { speech: { status: 'ok', text: 'a'.repeat(8000 * 6 + 1) } })
    expect(r?.state).toBe('review_required')
    expect(mem.moderationResults[0].reasonCode).toBe('evidence_missing:speech')
  })
})
