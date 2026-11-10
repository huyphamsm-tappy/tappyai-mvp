// Explore video VID-03: what the human review desk reads and writes (service role only; the routes under src/app/api/admin/video-moderation call it AFTER the RBAC check).
//
// The review queue is the set of videos in `review_required`, ordered urgent first and then oldest first. It is NOT the report queue (`moderation_queue`): that one is tied to reported
// posts, comments, users and tracks, and its decide route resolves a report target and a strike ledger; an AI-flagged video has none of that, and bending the report CHECK constraints
// to carry it would put two meanings in one table. The history, the transcript and the scores come from the append-only video_moderation_results; the decision goes through
// video_moderation_review_decide (note required, one transaction, idempotent).
//
// Object keys never leave this module toward a browser: the evidence references are stripped of `key` here, and the frames are served by the route from the private bucket.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReviewPriority } from './moderationPolicy'

export interface PendingItem {
  assetId: string
  priority: ReviewPriority
  severe: boolean
  category: string | null
  confidence: number | null
  reasonCode: string | null
  hasAudio: boolean | null
  durationMs: number | null
  waitingSince: string
}

export interface ResultRow {
  id: number
  kind: 'automated' | 'human'
  decision: 'approve' | 'review_required' | 'reject'
  category: string | null
  confidence: number | null
  reasonCode: string
  priority: ReviewPriority | null
  provider: string | null
  model: string | null
  policyVersion: string | null
  /** Per-kind status and scores; object keys removed. */
  evidence: Record<string, unknown>
  transcript: string | null
  actor: string
  note: string | null
  createdAt: string
}

export interface EventRow { id: number; fromState: string | null; toState: string; eventType: string; actor: string; reason: string | null; createdAt: string }

export interface ReviewDetail {
  asset: { id: string; ownerId: string; state: string; moderationState: string; hasAudio: boolean | null; durationMs: number | null; width: number | null; height: number | null; legalHoldUntil: string | null; updatedAt: string }
  /** A `csam_suspected` event exists: approving needs a higher permission. */
  severe: boolean
  results: ResultRow[]
  events: EventRow[]
}

export interface VideoModerationAdminStore {
  listPending(limit: number): Promise<PendingItem[]>
  detail(assetId: string): Promise<ReviewDetail | null>
  decide(assetId: string, decision: 'approve' | 'reject', note: string, actor: string): Promise<{ state: string; changed: boolean }>
}

const PRIORITY_RANK: Record<ReviewPriority, number> = { urgent: 0, high: 1, normal: 2 }

function fail(op: string, error: { message?: string; code?: string }): never {
  throw Object.assign(new Error(`video moderation store: ${op} failed${error.code ? ` (${error.code})` : ''}`), { code: error.code })
}

/** The evidence as a moderator may see it: statuses, reasons and scores; never an object key. */
export function publicEvidence(evidence: unknown): Record<string, unknown> {
  if (!evidence || typeof evidence !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [kind, value] of Object.entries(evidence as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      const { key: _key, ...rest } = value as Record<string, unknown>
      void _key
      out[kind] = rest
    } else out[kind] = value
  }
  return out
}

export function supabaseVideoModerationAdminStore(admin: SupabaseClient): VideoModerationAdminStore {
  return {
    async listPending(limit) {
      const { data: assets, error } = await admin
        .from('video_assets')
        .select('id, has_audio, duration_ms, updated_at')
        .eq('state', 'review_required')
        .order('updated_at', { ascending: true })
        .limit(limit)
      if (error) fail('listPending', error)
      const rows = (assets ?? []) as Array<{ id: string; has_audio: boolean | null; duration_ms: number | null; updated_at: string }>
      if (rows.length === 0) return []
      const ids = rows.map((r) => r.id)

      const { data: results, error: rErr } = await admin
        .from('video_moderation_results')
        .select('asset_id, kind, category, confidence, reason_code, priority')
        .in('asset_id', ids)
        .order('id', { ascending: false })
      if (rErr) fail('listPending.results', rErr)
      const { data: csam, error: cErr } = await admin.from('video_asset_events').select('asset_id').in('asset_id', ids).eq('event_type', 'csam_suspected')
      if (cErr) fail('listPending.events', cErr)

      // The newest AUTOMATED result describes why the video is waiting (a human result never leaves a video in review).
      const latest = new Map<string, { category: string | null; confidence: number | null; reason_code: string; priority: ReviewPriority | null }>()
      for (const r of (results ?? []) as Array<{ asset_id: string; kind: string; category: string | null; confidence: number | string | null; reason_code: string; priority: ReviewPriority | null }>) {
        if (r.kind === 'automated' && !latest.has(r.asset_id)) latest.set(r.asset_id, { category: r.category, confidence: r.confidence === null ? null : Number(r.confidence), reason_code: r.reason_code, priority: r.priority })
      }
      const severeIds = new Set(((csam ?? []) as Array<{ asset_id: string }>).map((c) => c.asset_id))

      const items = rows.map((r): PendingItem => {
        const l = latest.get(r.id)
        const severe = severeIds.has(r.id)
        return {
          assetId: r.id,
          priority: severe ? 'urgent' : (l?.priority ?? 'normal'),
          severe,
          category: l?.category ?? null,
          confidence: l?.confidence ?? null,
          reasonCode: l?.reason_code ?? null,
          hasAudio: r.has_audio,
          durationMs: r.duration_ms,
          waitingSince: r.updated_at,
        }
      })
      // Urgent first, then oldest first (the rows already arrive oldest first and the sort is stable).
      return items.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    },

    async detail(assetId) {
      const { data: a, error } = await admin
        .from('video_assets')
        .select('id, owner_id, state, moderation_state, has_audio, duration_ms, width, height, legal_hold_until, updated_at')
        .eq('id', assetId)
        .maybeSingle()
      if (error) fail('detail', error)
      if (!a) return null
      const asset = a as { id: string; owner_id: string; state: string; moderation_state: string; has_audio: boolean | null; duration_ms: number | null; width: number | null; height: number | null; legal_hold_until: string | null; updated_at: string }

      const { data: results, error: rErr } = await admin
        .from('video_moderation_results')
        .select('id, kind, decision, category, confidence, reason_code, priority, provider, model, policy_version, evidence, transcript, actor, note, created_at')
        .eq('asset_id', assetId)
        .order('id', { ascending: true })
      if (rErr) fail('detail.results', rErr)
      const { data: events, error: eErr } = await admin
        .from('video_asset_events')
        .select('id, from_state, to_state, event_type, actor, reason, created_at')
        .eq('asset_id', assetId)
        .order('id', { ascending: true })
      if (eErr) fail('detail.events', eErr)

      const evs = ((events ?? []) as Array<{ id: number; from_state: string | null; to_state: string; event_type: string; actor: string; reason: string | null; created_at: string }>)
      return {
        asset: {
          id: asset.id, ownerId: asset.owner_id, state: asset.state, moderationState: asset.moderation_state, hasAudio: asset.has_audio, durationMs: asset.duration_ms,
          width: asset.width, height: asset.height, legalHoldUntil: asset.legal_hold_until, updatedAt: asset.updated_at,
        },
        severe: evs.some((e) => e.event_type === 'csam_suspected'),
        results: ((results ?? []) as Array<Record<string, unknown>>).map((r): ResultRow => ({
          id: Number(r.id), kind: r.kind as ResultRow['kind'], decision: r.decision as ResultRow['decision'], category: (r.category as string | null) ?? null,
          confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence), reasonCode: String(r.reason_code), priority: (r.priority as ReviewPriority | null) ?? null,
          provider: (r.provider as string | null) ?? null, model: (r.model as string | null) ?? null, policyVersion: (r.policy_version as string | null) ?? null,
          evidence: publicEvidence(r.evidence), transcript: (r.transcript as string | null) ?? null, actor: String(r.actor), note: (r.note as string | null) ?? null, createdAt: String(r.created_at),
        })),
        events: evs.map((e): EventRow => ({ id: Number(e.id), fromState: e.from_state, toState: e.to_state, eventType: e.event_type, actor: e.actor, reason: e.reason, createdAt: e.created_at })),
      }
    },

    async decide(assetId, decision, note, actor) {
      const { data, error } = await admin.rpc('video_moderation_review_decide', { p_asset: assetId, p_decision: decision, p_note: note, p_actor: actor })
      if (error) fail('decide', error)
      const row = (Array.isArray(data) ? data[0] : data) as { state: string; changed: boolean } | null
      if (!row) fail('decide', { message: 'no row' })
      return { state: row.state, changed: row.changed }
    },
  }
}
