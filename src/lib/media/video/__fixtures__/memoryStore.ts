// An in-memory stand-in for the video_assets database, shared by the upload-flow and processing tests. It enforces the SAME transition table as the database trigger
// (via canTransition) and counts what the code under test does to it. `clock` lets a test move time to exercise timeouts and the reconciliation window.

import { canTransition, type ModerationState, type VideoAssetState } from '../assetState'
import type { AutoModerationRecord, VideoAssetRow, VideoAssetStore } from '../uploadFlow'

export interface RecordedEvent { id: string; from: VideoAssetState; to: VideoAssetState; eventType: string; actor: string; reason?: string | null }

/** `ids`: how asset ids are minted. The default is readable (asset-1); processing tests pass uuidIds, because staging folders are keyed by a real uuid. */
export const uuidIds = (n: number) => `3000000${n}-3333-4333-8333-333333333333`.slice(0, 36)

export function memoryStore(clock: { now: number } = { now: Date.parse('2026-11-05T10:00:00Z') }, ids: (n: number) => string = (n) => `asset-${n}`) {
  const rows = new Map<string, VideoAssetRow>()
  const events: RecordedEvent[] = []
  const byKey = new Map<string, string>()
  const media = new Map<string, { durationMs: number; width: number; height: number; hasAudio: boolean }>()
  let n = 0
  const calls = { create: 0 }
  /** What the moderation step recorded (the database keeps these in video_moderation_results) and the legal holds it set. */
  const moderationResults: Array<AutoModerationRecord & { assetId: string }> = []
  const holds = new Map<string, string>()
  const touch = (r: VideoAssetRow) => { r.updated_at = new Date(clock.now).toISOString() }

  const store: VideoAssetStore = {
    async findByIdempotencyKey(ownerId, key) {
      const id = byKey.get(`${ownerId}|${key}`)
      return id ? { ...rows.get(id)! } : null
    },
    async create(ownerId, key) {
      calls.create++
      const id = ids(++n)
      const row: VideoAssetRow = {
        id, owner_id: ownerId, state: 'draft', moderation_state: 'pending', source_bucket: null, source_object_key: null,
        has_audio: null, duration_ms: null, width: null, height: null, transcode_job_id: null, transcode_attempts: 0, staging_manifest_key: null, moderation_attempts: 0,
        updated_at: new Date(clock.now).toISOString(),
      }
      rows.set(row.id, row)
      byKey.set(`${ownerId}|${key}`, row.id)
      return { ...row }
    },
    async get(id) { const r = rows.get(id); return r ? { ...r } : null },
    async setSource(id, bucket, key) { const r = rows.get(id)!; r.source_bucket = bucket; r.source_object_key = key; touch(r) },
    async setMediaInfo(id, info) {
      media.set(id, info)
      const r = rows.get(id)!; r.duration_ms = info.durationMs; r.width = info.width; r.height = info.height; r.has_audio = info.hasAudio; touch(r)
    },
    async setTranscodeJob(id, rec) { const r = rows.get(id)!; r.transcode_job_id = rec.jobName; r.transcode_attempts = rec.attempts; touch(r) },
    async setStaging(id, manifestKey) { const r = rows.get(id)!; r.staging_manifest_key = manifestKey; touch(r) },
    async listProcessing(olderThanMs, limit) {
      return [...rows.values()].filter(r => r.state === 'processing' && clock.now - Date.parse(r.updated_at) > olderThanMs)
        .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at)).slice(0, limit).map(r => ({ ...r }))
    },
    async listModerating(olderThanMs, limit) {
      return [...rows.values()].filter(r => r.state === 'moderating' && clock.now - Date.parse(r.updated_at) > olderThanMs)
        .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at)).slice(0, limit).map(r => ({ ...r }))
    },
    async setModerationAttempt(id, rec) { const r = rows.get(id)!; r.moderation_attempts = rec.attempts; touch(r) },
    async noteEventOnce(id, ev) {
      if (events.some(e => e.id === id && e.eventType === ev.eventType)) return false
      const r = rows.get(id)!
      events.push({ id, from: r.state, to: r.state, eventType: ev.eventType, actor: ev.actor, reason: ev.reason })
      return true
    },
    // The same rules as video_moderation_record_auto: only a video still in `moderating` is decided; a child-safety case is always review_required with a hold.
    async recordAutoModeration(id, rec) {
      const r = rows.get(id)!
      if (r.state !== 'moderating') return { state: r.state, changed: false }
      if (rec.csam && (rec.decision !== 'review_required' || !rec.holdUntil)) throw Object.assign(new Error('csam needs review_required and a hold'), { code: '22023' })
      moderationResults.push({ ...rec, assetId: id })
      if (rec.csam) {
        events.push({ id, from: r.state, to: r.state, eventType: 'csam_suspected', actor: rec.actor, reason: rec.reasonCode })
        holds.set(id, rec.holdUntil!)
      }
      const to: VideoAssetState = rec.decision === 'approve' ? 'ready' : rec.decision === 'reject' ? 'rejected' : 'review_required'
      const moderation: ModerationState = rec.decision === 'approve' ? 'approved' : rec.decision === 'reject' ? 'rejected' : 'review_required'
      events.push({ id, from: r.state, to, eventType: `moderation_${rec.decision}`, actor: rec.actor, reason: rec.reasonCode })
      r.state = to
      r.moderation_state = moderation
      touch(r)
      return { state: r.state, changed: true }
    },
    async transition(id, to, ev) {
      const r = rows.get(id)!
      if (r.state === to) return { state: r.state, changed: false }
      if (!canTransition(r.state, to)) throw Object.assign(new Error('illegal'), { code: '23514' })
      events.push({ id, from: r.state, to, eventType: ev.eventType, actor: ev.actor, reason: ev.reason })
      r.state = to
      if (ev.moderation) r.moderation_state = ev.moderation as ModerationState
      touch(r)
      return { state: r.state, changed: true }
    },
  }
  return { store, rows, events, calls, media, clock, moderationResults, holds }
}
