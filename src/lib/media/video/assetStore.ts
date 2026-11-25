// The database side of the video upload flow: the real VideoAssetStore over the service-role Supabase client.
// Every write goes through the video_asset_transition function (20261111_video_assets.sql), so the state table, the event history and the idempotency are the
// database's, not this file's.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModerationState, VideoAssetState } from './assetState'
import type { TransitionEvent, VideoAssetRow, VideoAssetStore } from './uploadFlow'

const COLUMNS =
  'id, owner_id, state, moderation_state, source_bucket, source_object_key, has_audio, duration_ms, width, height, transcode_job_id, transcode_attempts, staging_manifest_key, moderation_attempts, updated_at'

function fail(op: string, error: { message?: string; code?: string }): never {
  // The database message can carry row data; keep only the operation and the SQLSTATE.
  throw Object.assign(new Error(`video asset store: ${op} failed${error.code ? ` (${error.code})` : ''}`), { code: error.code })
}

export function supabaseVideoAssetStore(admin: SupabaseClient): VideoAssetStore {
  const find = async (ownerId: string, key: string): Promise<VideoAssetRow | null> => {
    const { data, error } = await admin.from('video_assets').select(COLUMNS).eq('owner_id', ownerId).eq('idempotency_key', key).maybeSingle()
    if (error) fail('find', error)
    return (data as VideoAssetRow | null) ?? null
  }
  return {
    findByIdempotencyKey: find,

    async create(ownerId, idempotencyKey) {
      const { data, error } = await admin.from('video_assets').insert({ owner_id: ownerId, idempotency_key: idempotencyKey }).select(COLUMNS).single()
      if (!error) return data as VideoAssetRow
      // Two requests with the same key raced: the unique constraint picked one, the other reads it. Never a duplicate asset.
      if (error.code === '23505') {
        const existing = await find(ownerId, idempotencyKey)
        if (existing) return existing
      }
      return fail('create', error)
    },

    async get(id) {
      const { data, error } = await admin.from('video_assets').select(COLUMNS).eq('id', id).maybeSingle()
      if (error) fail('get', error)
      return (data as VideoAssetRow | null) ?? null
    },

    async setSource(id, bucket, key) {
      const { error } = await admin.from('video_assets').update({ source_bucket: bucket, source_object_key: key }).eq('id', id)
      if (error) fail('setSource', error)
    },

    async setMediaInfo(id, info) {
      const { error } = await admin.from('video_assets').update({ duration_ms: info.durationMs, width: info.width, height: info.height, has_audio: info.hasAudio }).eq('id', id)
      if (error) fail('setMediaInfo', error)
    },

    async setTranscodeJob(id, rec) {
      const { error } = await admin.from('video_assets').update({ transcode_job_id: rec.jobName, transcode_attempts: rec.attempts, transcode_error: rec.error }).eq('id', id)
      if (error) fail('setTranscodeJob', error)
    },

    async setStaging(id, manifestKey) {
      const { error } = await admin.from('video_assets').update({ staging_manifest_key: manifestKey, transcode_error: null }).eq('id', id)
      if (error) fail('setStaging', error)
    },

    async listProcessing(olderThanMs, limit) {
      const before = new Date(Date.now() - olderThanMs).toISOString()
      const { data, error } = await admin.from('video_assets').select(COLUMNS).eq('state', 'processing').lt('updated_at', before).order('updated_at', { ascending: true }).limit(limit)
      if (error) fail('listProcessing', error)
      return (data ?? []) as VideoAssetRow[]
    },

    async listModerating(olderThanMs, limit) {
      const before = new Date(Date.now() - olderThanMs).toISOString()
      const { data, error } = await admin.from('video_assets').select(COLUMNS).eq('state', 'moderating').lt('updated_at', before).order('updated_at', { ascending: true }).limit(limit)
      if (error) fail('listModerating', error)
      return (data ?? []) as VideoAssetRow[]
    },

    async setModerationAttempt(id, rec) {
      const { error } = await admin.from('video_assets').update({ moderation_attempts: rec.attempts, moderation_error: rec.error }).eq('id', id)
      if (error) fail('setModerationAttempt', error)
    },

    async noteEventOnce(id, ev) {
      const { data, error } = await admin.rpc('video_asset_note_event_once', { p_asset: id, p_event_type: ev.eventType, p_actor: ev.actor, p_reason: ev.reason })
      if (error) fail('noteEventOnce', error)
      return data === true
    },

    async recordAutoModeration(id, rec) {
      const { data, error } = await admin.rpc('video_moderation_record_auto', {
        p_asset: id,
        p_decision: rec.decision,
        p_category: rec.category,
        p_confidence: rec.confidence,
        p_reason: rec.reasonCode,
        p_priority: rec.priority,
        p_provider: rec.provider,
        p_model: rec.model,
        p_policy: rec.policyVersion,
        p_evidence: rec.evidence,
        p_transcript: rec.transcript,
        p_csam: rec.csam,
        p_hold_until: rec.holdUntil,
        p_actor: rec.actor,
      })
      if (error) fail('recordAutoModeration', error)
      const row = (Array.isArray(data) ? data[0] : data) as { state: VideoAssetState; changed: boolean } | null
      if (!row) fail('recordAutoModeration', { message: 'no row' })
      return { state: row.state, changed: row.changed }
    },

    async transition(id: string, to: VideoAssetState, ev: TransitionEvent) {
      const { data, error } = await admin.rpc('video_asset_transition', {
        p_asset: id,
        p_to: to,
        p_event_type: ev.eventType,
        p_actor: ev.actor,
        p_reason: ev.reason ?? null,
        p_correlation: ev.correlation ?? null,
        p_moderation_state: (ev.moderation ?? null) as ModerationState | null,
      })
      if (error) fail('transition', error)
      const row = (Array.isArray(data) ? data[0] : data) as { state: VideoAssetState; changed: boolean } | null
      if (!row) fail('transition', { message: 'no row' })
      return { state: row.state, changed: row.changed }
    },
  }
}
