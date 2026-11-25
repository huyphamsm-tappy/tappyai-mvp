// The database side of promotion, publishing, playback access and takedown (Explore video, publishing + delivery slice). Written against a small interface so every flow is
// tested without a database; `supabaseVideoDeliveryStore` is the real one over the service-role client. Every state change goes through the video_asset_transition /
// video_asset_publish functions (20261111 / 20261116), so the state table and the history are the database's.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModerationState, VideoAssetState } from './assetState'
import type { TransitionEvent } from './uploadFlow'

export interface DeliveryAssetRow {
  id: string
  owner_id: string
  state: VideoAssetState
  moderation_state: ModerationState
  deleted_at: string | null
  review_id: string | null
  duration_ms: number | null
  staging_manifest_key: string | null
  delivery_manifest_key: string | null
  /** Set when the delivery copy was removed (takedown). While set, the video cannot be played even if the state is `published`. */
  delivery_removed_at: string | null
  delivery_takedown_attempts: number
  updated_at: string
}

/** What decides whether a post is public: the same two columns every feed query filters on. */
export interface ReviewVisibility {
  id: string
  user_id: string
  is_hidden: boolean | null
  publication_state: string | null
}

export type TakedownReason = 'state' | 'post_not_public'
export interface TakedownCandidate extends DeliveryAssetRow { takedown_reason: TakedownReason }

export interface VideoDeliveryStore {
  get(id: string): Promise<DeliveryAssetRow | null>
  getReview(id: string): Promise<ReviewVisibility | null>
  /** Records the delivery copy and clears any earlier takedown mark (a re-approved video is promoted again). */
  setDeliveryManifest(id: string, manifestKey: string): Promise<void>
  transition(id: string, to: VideoAssetState, ev: TransitionEvent): Promise<{ state: VideoAssetState; changed: boolean }>
  /**
   * ready -> published, atomically stamping the post that carries the video. Idempotent per (asset, review): the second call changes nothing. When the asset already belongs
   * to ANOTHER post, `reviewId` is that post's id (the caller never creates a second post). Throws with SQLSTATE 23514 (not ready/approved), 55000 (no delivery copy),
   * 42501 (not the owner's) or P0002 (unknown).
   */
  publish(id: string, ownerId: string, reviewId: string): Promise<{ state: VideoAssetState; reviewId: string | null; changed: boolean }>
  /** Counts a takedown attempt; `removed` stamps delivery_removed_at. `error` is a short code, never a provider message. */
  recordTakedown(id: string, rec: { removed: boolean; error: string | null }): Promise<void>
  /** Videos whose delivery copy must be removed now (state left `published`/`ready`, or the post is no longer public), oldest first, below the attempt ceiling. */
  listDueTakedown(limit: number, maxAttempts: number): Promise<TakedownCandidate[]>
}

const COLUMNS =
  'id, owner_id, state, moderation_state, deleted_at, review_id, duration_ms, staging_manifest_key, delivery_manifest_key, delivery_removed_at, delivery_takedown_attempts, updated_at'

function fail(op: string, error: { message?: string; code?: string }): never {
  // The database message can carry row data; keep only the operation and the SQLSTATE.
  throw Object.assign(new Error(`video delivery store: ${op} failed${error.code ? ` (${error.code})` : ''}`), { code: error.code })
}

export function supabaseVideoDeliveryStore(admin: SupabaseClient): VideoDeliveryStore {
  return {
    async get(id) {
      const { data, error } = await admin.from('video_assets').select(COLUMNS).eq('id', id).maybeSingle()
      if (error) fail('get', error)
      return (data as DeliveryAssetRow | null) ?? null
    },

    async getReview(id) {
      const { data, error } = await admin.from('reviews').select('id, user_id, is_hidden, publication_state').eq('id', id).maybeSingle()
      // publication_state is absent on a database without the content-safety migration: read what exists, treat the rest as legacy (null).
      if (error && (error.code === '42703' || /publication_state/.test(error.message ?? ''))) {
        const retry = await admin.from('reviews').select('id, user_id, is_hidden').eq('id', id).maybeSingle()
        if (retry.error) fail('getReview', retry.error)
        return retry.data ? ({ ...(retry.data as object), publication_state: null } as ReviewVisibility) : null
      }
      if (error) fail('getReview', error)
      return (data as ReviewVisibility | null) ?? null
    },

    async setDeliveryManifest(id, manifestKey) {
      const { error } = await admin
        .from('video_assets')
        .update({ delivery_manifest_key: manifestKey, delivery_removed_at: null, delivery_takedown_attempts: 0, delivery_takedown_error: null })
        .eq('id', id)
      if (error) fail('setDeliveryManifest', error)
    },

    async transition(id, to, ev) {
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

    async publish(id, ownerId, reviewId) {
      const { data, error } = await admin.rpc('video_asset_publish', { p_asset: id, p_owner: ownerId, p_review: reviewId, p_actor: `user:${ownerId}` })
      if (error) fail('publish', error)
      const row = (Array.isArray(data) ? data[0] : data) as { state: VideoAssetState; review_id: string | null; changed: boolean } | null
      if (!row) fail('publish', { message: 'no row' })
      return { state: row.state, reviewId: row.review_id, changed: row.changed }
    },

    async recordTakedown(id, rec) {
      const { error } = await admin.rpc('video_asset_record_takedown', { p_asset: id, p_removed: rec.removed, p_error: rec.error })
      if (error) fail('recordTakedown', error)
    },

    async listDueTakedown(limit, maxAttempts) {
      const { data, error } = await admin.rpc('video_assets_due_for_takedown', { p_limit: limit, p_max_attempts: maxAttempts })
      if (error) {
        // 42883 / PGRST202: migration 20261116 not applied yet. Nothing to take down, and the sweep must not fail every night.
        if (error.code === '42883' || error.code === 'PGRST202') return []
        fail('listDueTakedown', error)
      }
      return (data ?? []) as TakedownCandidate[]
    },
  }
}
