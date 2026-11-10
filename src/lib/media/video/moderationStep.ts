// Explore video VID-03: the step that turns `moderating` into `ready` / `review_required` / `rejected` (ADR rev.1 §B2, rev.2 §2.2).
//
//   moderating --(evidence gathered, decision engine)--> ready (approved) | review_required | rejected
//
// Evidence (all of it comes from the transcoder's PRIVATE staging folder `vstg/<owner>/<asset>/`, never from a public URL):
//   visual   the 3x2 sprite sheet of six frames, through the OpenAI moderation adapter (free of charge);
//   speech   the audio-only file -> TEXT (transcription adapter, spend-gated) -> the TEXT moderated. Only SPEECH counts: no sound classification (owner: gunshots, screams, thunder are
//            not violations). Runs only when VIDEO_SPEECH_TRANSCRIBE_ENABLED; with it off, a clip that has audio has speech NOT ANALYSED, so it cannot be approved;
//   overlay  the text layers the user put on the video, moderated as text (the source is injected; the default has none).
//
// Before ANY provider call the owner must have AI data consent. Without it nothing is sent and the video stays in `moderating` (a note event `no_ai_consent`, written once): it is not a failure.
// A provider that does not answer keeps the video in `moderating` and is retried later (back-off; bounded attempts), after which a person decides. The decision itself is the PURE function
// of moderationPolicy.ts. Everything is recorded by ONE database call (video_moderation_record_auto) that only a video still in `moderating` accepts, so running the step twice writes
// one decision. A suspected child-safety case is never decided here: urgent review, a `csam_suspected` event and a legal hold, written by that same call, and nothing else happens.
// Codes and counts only in anything logged or returned; never object keys, text or scores.

import { videoAssetStagingPrefix } from '../key'
import { OPENAI_MODERATION_MODEL, type ModerationOutcome } from '@/lib/ai/llm/providers/openaiModeration'
import { OPENAI_TRANSCRIBE_MODEL, type TranscribeOutcome } from '@/lib/ai/llm/providers/openaiTranscribe'
import type { VideoAssetState } from './assetState'
import { DEFAULT_MODERATION_POLICY, decideModeration, type EvidenceItem, type EvidenceKind, type ModerationPolicy } from './moderationPolicy'
import type { VideoAssetStore } from './uploadFlow'

export const MAX_MODERATION_ATTEMPTS = 4
/** After a failed attempt the video is left alone this long (every status poll would otherwise call the provider again). */
export const MODERATION_RETRY_BACKOFF_MS = 2 * 60_000
/** How long a suspected child-safety case is held (the original is kept; the clean-up skips it). A decision of the owner's counsel may change it. */
export const CSAM_HOLD_DAYS = 365
export const SPRITE_FILE = 'frames0000000000.jpeg'
export const AUDIO_FILE = 'audio.mp4'
const TRANSCRIPT_PIECE_CHARS = 8000
const TRANSCRIPT_MAX_PIECES = 6
const ACTOR = 'service:video-moderation'
const PROVIDER = 'openai'

/** Reads one object of the private bucket. null = it is not there; a thrown error = storage is unavailable (retry). */
export interface EvidenceReader { read(key: string): Promise<Uint8Array | null> }
/** The text layers the user put on a video. Implemented elsewhere (the overlay editor); the default has none. */
export interface OverlayTextSource { textOf(assetId: string): Promise<string[]> }
export const emptyOverlayTextSource: OverlayTextSource = { async textOf() { return [] } }

export interface ModerationDeps {
  store: VideoAssetStore
  reader: EvidenceReader
  /** True when the account's data may go to the AI provider (src/lib/ai/consent). */
  consent: { isAllowed(ownerId: string): Promise<boolean> }
  moderateImage(bytes: Uint8Array, mime: string): Promise<ModerationOutcome>
  moderateText(texts: string[]): Promise<ModerationOutcome>
  transcribe(audio: Uint8Array, info: { durationMs: number }): Promise<TranscribeOutcome>
  overlay?: OverlayTextSource
  /** VIDEO_SPEECH_TRANSCRIBE_ENABLED. */
  speechEnabled: boolean
  /** VIDEO_MODERATION_AUTO_REJECT_ENABLED (default off). */
  autoRejectEnabled: boolean
  policy?: ModerationPolicy
  now?: () => number
}

export type ModerationAction = 'none' | 'decided' | 'waiting' | 'no_consent'
export interface ModerationStepResult { assetId: string; state: VideoAssetState; action: ModerationAction }

interface Piece { item: EvidenceItem; ref: Record<string, unknown>; transient: boolean }
const notAnalysed = (kind: EvidenceKind, reason: string, extra: Record<string, unknown> = {}, transient = false): Piece =>
  ({ item: { kind, status: 'not_analysed', scores: {}, flagged: [] }, ref: { status: 'not_analysed', reason, ...extra }, transient })
const fromOutcome = (kind: EvidenceKind, out: ModerationOutcome, extra: Record<string, unknown> = {}): Piece => {
  if (out.status !== 'ok') return notAnalysed(kind, `provider_${out.reason}`, extra, true)
  // No scores means the provider's answer cannot be weighed against a threshold: it is not evidence.
  if (!out.scores) return notAnalysed(kind, 'no_scores', extra, false)
  const flagged = Object.entries(out.categories).filter(([, v]) => v === true).map(([c]) => c)
  return { item: { kind, status: 'analysed', scores: out.scores, flagged }, ref: { status: 'analysed', scores: out.scores, flagged, ...extra }, transient: false }
}
const emptyPiece = (kind: EvidenceKind, extra: Record<string, unknown> = {}): Piece => ({ item: { kind, status: 'empty', scores: {}, flagged: [] }, ref: { status: 'empty', ...extra }, transient: false })

function chunk(text: string): string[] | null {
  const out: string[] = []
  for (let i = 0; i < text.length; i += TRANSCRIPT_PIECE_CHARS) out.push(text.slice(i, i + TRANSCRIPT_PIECE_CHARS))
  return out.length > TRANSCRIPT_MAX_PIECES ? null : out
}

export async function moderateVideoAsset(assetId: string, deps: ModerationDeps): Promise<ModerationStepResult | null> {
  const asset = await deps.store.get(assetId)
  if (!asset) return null
  const result = (state: VideoAssetState, action: ModerationAction): ModerationStepResult => ({ assetId: asset.id, state, action })
  if (asset.state !== 'moderating') return result(asset.state, 'none')
  const now = (deps.now ?? Date.now)()

  // 1. Consent first: no provider is called for an account that has not agreed. A consent that cannot be read counts as "no".
  let allowed = false
  try { allowed = await deps.consent.isAllowed(asset.owner_id) } catch { allowed = false }
  if (!allowed) {
    await deps.store.noteEventOnce(asset.id, { eventType: 'no_ai_consent', actor: ACTOR, reason: 'no_ai_consent' })
    return result('moderating', 'no_consent')
  }

  // 2. Back-off after a failed attempt.
  const priorAttempts = asset.moderation_attempts ?? 0
  if (priorAttempts > 0 && now - Date.parse(asset.updated_at) < MODERATION_RETRY_BACKOFF_MS) return result('moderating', 'waiting')

  const prefix = videoAssetStagingPrefix(asset.owner_id, asset.id)
  const spriteKey = `${prefix}${SPRITE_FILE}`
  const audioKey = `${prefix}${AUDIO_FILE}`
  const hasAudio = asset.has_audio === true
  const refs: Record<string, unknown> = {}
  const pieces: Piece[] = []
  const kept: { transcript: string | null } = { transcript: null }

  // 3a. Visual (free). Looked at first: if the provider is down there is no reason to pay for a transcription now.
  let visual: Piece
  try {
    const bytes = await deps.reader.read(spriteKey)
    visual = bytes ? fromOutcome('visual', await deps.moderateImage(bytes, 'image/jpeg'), { key: spriteKey }) : notAnalysed('visual', 'sprite_missing', { key: spriteKey })
  } catch { visual = notAnalysed('visual', 'storage_unavailable', { key: spriteKey }, true) }
  pieces.push(visual)

  // 3b. Overlay text (free).
  let overlay: Piece
  try {
    const texts = ((await (deps.overlay ?? emptyOverlayTextSource).textOf(asset.id)) ?? []).filter((t) => typeof t === 'string' && t.trim() !== '')
    overlay = texts.length === 0 ? emptyPiece('overlay', { count: 0 }) : fromOutcome('overlay', await deps.moderateText(texts), { count: texts.length, texts })
  } catch { overlay = notAnalysed('overlay', 'overlay_unavailable', {}, true) }
  pieces.push(overlay)

  // 3c. Speech, only when there is any, only when switched on, and not when something above already failed to answer (it would be paid for again on the retry).
  if (!hasAudio) {
    pieces.push(emptyPiece('speech', { reason: 'no_audio' }))
  } else if (!deps.speechEnabled) {
    pieces.push(notAnalysed('speech', 'speech_transcription_off', { key: audioKey }))
  } else if (visual.transient || overlay.transient) {
    pieces.push(notAnalysed('speech', 'deferred', { key: audioKey }, true))
  } else {
    pieces.push(await speechPiece(asset.duration_ms, audioKey, deps, (t) => { kept.transcript = t }))
  }
  for (const p of pieces) refs[p.item.kind] = p.ref

  // 4. A provider that did not answer: wait and retry; when the attempts are used up, a person decides.
  const transient = pieces.some((p) => p.transient)
  const attempts = priorAttempts + 1
  if (transient && attempts < MAX_MODERATION_ATTEMPTS) {
    await deps.store.setModerationAttempt(asset.id, { attempts, error: 'provider_unavailable' })
    return result('moderating', 'waiting')
  }

  // 5. Decide (pure) and record everything in one call.
  const required: EvidenceKind[] = hasAudio ? ['visual', 'speech', 'overlay'] : ['visual', 'overlay']
  const policy = deps.policy ?? DEFAULT_MODERATION_POLICY
  const d = decideModeration({ evidence: pieces.map((p) => p.item), required, autoRejectEnabled: deps.autoRejectEnabled, policy })
  const reasonCode = transient && !d.severe && d.decision === 'review_required' ? `provider_unavailable:${d.reasonCode}` : d.reasonCode
  const recorded = await deps.store.recordAutoModeration(asset.id, {
    decision: d.decision,
    category: d.category,
    confidence: Math.round(d.confidence * 100000) / 100000,
    reasonCode: reasonCode.slice(0, 120),
    priority: d.priority,
    provider: PROVIDER,
    model: kept.transcript !== null ? `${OPENAI_MODERATION_MODEL}+${OPENAI_TRANSCRIBE_MODEL}` : OPENAI_MODERATION_MODEL,
    policyVersion: policy.version,
    evidence: refs,
    transcript: kept.transcript === null ? null : kept.transcript.slice(0, 20_000),
    csam: d.severe,
    holdUntil: d.severe ? new Date(now + CSAM_HOLD_DAYS * 86_400_000).toISOString() : null,
    actor: ACTOR,
  })
  return result(recorded.state, 'decided')
}

async function speechPiece(durationMs: number | null, audioKey: string, deps: ModerationDeps, keep: (text: string) => void): Promise<Piece> {
  let audio: Uint8Array | null
  try { audio = await deps.reader.read(audioKey) } catch { return notAnalysed('speech', 'storage_unavailable', { key: audioKey }, true) }
  if (!audio) return notAnalysed('speech', 'audio_missing', { key: audioKey })
  const said = await deps.transcribe(audio, { durationMs: durationMs ?? 5 * 60_000 })
  if (said.status !== 'ok') return notAnalysed('speech', `provider_${said.reason}`, { key: audioKey }, true)
  keep(said.text)
  if (said.text === '') return emptyPiece('speech', { key: audioKey, transcriptChars: 0 })
  const pieces = chunk(said.text)
  if (!pieces) return notAnalysed('speech', 'transcript_too_long', { key: audioKey, transcriptChars: said.text.length })
  return fromOutcome('speech', await deps.moderateText(pieces), { key: audioKey, transcriptChars: said.text.length })
}
