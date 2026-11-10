// Explore video: who may PLAY a video. ONE function, used by the playback route and by nothing else deciding visibility.
//
// A video is public ONLY when its video_assets row is `published` AND moderation approved AND not deleted (isPubliclyViewable, the lifecycle's own question) AND its post is
// publicly readable (not hidden, publication_state PUBLISHED or legacy null, and the post exists) AND its delivery copy exists. The lifecycle is the single source of truth; the post
// only applies it. The OWNER may additionally preview their own video while it is `ready` (approved, not yet published) so they can check the result before posting.
//
// An allow-list on purpose: an unknown state or publication value falls through to "no".

import { isPubliclyViewable } from './assetState'
import { isPubliclyReadable, type StoredPublicationState } from '@/lib/safety/gate/publicationAccess'
import type { DeliveryAssetRow, ReviewVisibility } from './deliveryStore'

export type PlaybackDecision = { allow: true; reason: 'public' | 'owner_preview' } | { allow: false }

export function decidePlayback(input: { asset: DeliveryAssetRow; review: ReviewVisibility | null; viewerId: string | null }): PlaybackDecision {
  const { asset, review, viewerId } = input
  const hasDeliveryCopy = asset.delivery_manifest_key !== null && asset.delivery_removed_at === null
  if (!hasDeliveryCopy) return { allow: false }

  if (isPubliclyViewable({ state: asset.state, moderationState: asset.moderation_state, deletedAt: asset.deleted_at })) {
    if (review && review.is_hidden !== true && isPubliclyReadable(review.publication_state as StoredPublicationState)) return { allow: true, reason: 'public' }
    return { allow: false }
  }

  if (viewerId !== null && viewerId === asset.owner_id && asset.state === 'ready' && asset.moderation_state === 'approved' && asset.deleted_at === null) {
    return { allow: true, reason: 'owner_preview' }
  }
  return { allow: false }
}
