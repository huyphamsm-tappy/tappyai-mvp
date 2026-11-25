import { describe, it, expect } from 'vitest'
import { ASSET, OTHER_USER, OWNER, REVIEW, makeAsset } from './__fixtures__/memoryDeliveryStore'
import { decidePlayback } from './playbackAccess'

const DELIVERY = `vdel/${OWNER}/${ASSET}/manifest.m3u8`
const published = (over = {}) => makeAsset({ state: 'published', review_id: REVIEW, delivery_manifest_key: DELIVERY, ...over })
const publicReview = { id: REVIEW, user_id: OWNER, is_hidden: false, publication_state: 'PUBLISHED' }

describe('decidePlayback — the ONE rule for who may play a video', () => {
  it('a published, approved, undeleted video on a public post plays for anyone, signed in or not', () => {
    for (const viewer of [null, OTHER_USER, OWNER]) expect(decidePlayback({ asset: published(), review: publicReview, viewerId: viewer })).toEqual({ allow: true, reason: 'public' })
  })

  it('a legacy post (publication_state null) is public like everywhere else', () => {
    expect(decidePlayback({ asset: published(), review: { ...publicReview, publication_state: null }, viewerId: null }).allow).toBe(true)
  })

  it('🚨 a hidden, held or restricted post does not play, not even for its owner', () => {
    for (const review of [{ ...publicReview, is_hidden: true }, { ...publicReview, publication_state: 'UNDER_REVIEW' }, { ...publicReview, publication_state: 'RESTRICTED' }, { ...publicReview, publication_state: 'whatever' }, null]) {
      for (const viewer of [null, OTHER_USER, OWNER]) expect(decidePlayback({ asset: published(), review, viewerId: viewer }).allow, JSON.stringify(review)).toBe(false)
    }
  })

  it('🚨 every state other than published (for a stranger) refuses, whatever the moderation column says', () => {
    for (const state of ['draft', 'uploading', 'uploaded', 'processing', 'moderating', 'review_required', 'ready', 'rejected', 'failed', 'deleted'] as const) {
      expect(decidePlayback({ asset: published({ state, deleted_at: state === 'deleted' ? '2026-11-05T00:00:00Z' : null }), review: publicReview, viewerId: OTHER_USER }).allow, state).toBe(false)
    }
  })

  it('published but not approved, deleted, or with a removed delivery copy: refuses', () => {
    expect(decidePlayback({ asset: published({ moderation_state: 'review_required' }), review: publicReview, viewerId: null }).allow).toBe(false)
    expect(decidePlayback({ asset: published({ deleted_at: '2026-11-05T00:00:00Z' }), review: publicReview, viewerId: null }).allow).toBe(false)
    expect(decidePlayback({ asset: published({ delivery_removed_at: '2026-11-05T00:00:00Z' }), review: publicReview, viewerId: null }).allow).toBe(false)
    expect(decidePlayback({ asset: published({ delivery_manifest_key: null }), review: publicReview, viewerId: null }).allow).toBe(false)
  })

  it('the OWNER may preview their own video while it is ready (approved, not yet published); nobody else may', () => {
    const ready = makeAsset({ delivery_manifest_key: DELIVERY })
    expect(decidePlayback({ asset: ready, review: null, viewerId: OWNER })).toEqual({ allow: true, reason: 'owner_preview' })
    expect(decidePlayback({ asset: ready, review: null, viewerId: OTHER_USER }).allow).toBe(false)
    expect(decidePlayback({ asset: ready, review: null, viewerId: null }).allow).toBe(false)
  })

  it('the owner preview needs approval, a delivery copy, and no deletion; it never covers other states', () => {
    expect(decidePlayback({ asset: makeAsset({ delivery_manifest_key: null }), review: null, viewerId: OWNER }).allow).toBe(false)
    expect(decidePlayback({ asset: makeAsset({ delivery_manifest_key: DELIVERY, delivery_removed_at: '2026-11-05T00:00:00Z' }), review: null, viewerId: OWNER }).allow).toBe(false)
    expect(decidePlayback({ asset: makeAsset({ delivery_manifest_key: DELIVERY, deleted_at: '2026-11-05T00:00:00Z' }), review: null, viewerId: OWNER }).allow).toBe(false)
    for (const state of ['moderating', 'review_required', 'rejected', 'failed', 'processing'] as const) {
      expect(decidePlayback({ asset: makeAsset({ state, moderation_state: 'approved', delivery_manifest_key: DELIVERY }), review: null, viewerId: OWNER }).allow, state).toBe(false)
    }
  })
})
