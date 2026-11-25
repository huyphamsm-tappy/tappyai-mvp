// Explore video lifecycle (plan VID-05, ADR rev.1 §B1, 05/11/2026).
//
// ONE source of truth for which state may follow which. The database trigger of migration 20261111_video_assets.sql enforces the same table, and
// supabase/tests/video_assets.test.ts compares the two for every pair of states, so they cannot drift apart unnoticed.
//
// Order of the plan: the video is transcoded to a PRIVATE staging area first (the moderation evidence — frames, audio — comes from that output),
// is then moderated, and only an approved, fully processed video becomes `ready`; `published` is the last step and is the only state a viewer can see.

export const VIDEO_ASSET_STATES = [
  'draft',
  'uploading',
  'uploaded',
  'processing',
  'moderating',
  'review_required',
  'ready',
  'published',
  'rejected',
  'failed',
  'deleted',
] as const
export type VideoAssetState = (typeof VIDEO_ASSET_STATES)[number]

/** The decision recorded next to the state. `ready` and `published` require `approved` (a CHECK constraint in the database says the same). */
export const MODERATION_STATES = ['pending', 'approved', 'review_required', 'rejected'] as const
export type ModerationState = (typeof MODERATION_STATES)[number]

export const TRANSITIONS: Readonly<Record<VideoAssetState, readonly VideoAssetState[]>> = {
  draft: ['uploading', 'deleted'],
  uploading: ['uploaded', 'failed', 'deleted'],
  uploaded: ['processing', 'failed', 'deleted'],
  processing: ['moderating', 'failed', 'deleted'],
  moderating: ['ready', 'review_required', 'rejected', 'failed', 'deleted'],
  review_required: ['ready', 'rejected', 'deleted'],
  ready: ['published', 'review_required', 'deleted'],
  published: ['review_required', 'rejected', 'deleted'],
  rejected: ['review_required', 'deleted'],
  // A failed step is retried from the step that failed; it can never jump past it.
  failed: ['uploaded', 'processing', 'moderating', 'deleted'],
  deleted: [],
}

export class InvalidVideoTransitionError extends Error {
  readonly from: VideoAssetState
  readonly to: VideoAssetState
  constructor(from: VideoAssetState, to: VideoAssetState) {
    super(`video asset cannot go from "${from}" to "${to}"`)
    this.name = 'InvalidVideoTransitionError'
    this.from = from
    this.to = to
  }
}

export function canTransition(from: VideoAssetState, to: VideoAssetState): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: VideoAssetState, to: VideoAssetState): void {
  if (!canTransition(from, to)) throw new InvalidVideoTransitionError(from, to)
}

export function isTerminalState(state: VideoAssetState): boolean {
  return TRANSITIONS[state].length === 0
}

/** The single question a viewer-facing read asks. Nothing else makes a video visible. */
export function isPubliclyViewable(asset: { state: VideoAssetState; moderationState: ModerationState; deletedAt: string | null }): boolean {
  return asset.state === 'published' && asset.moderationState === 'approved' && asset.deletedAt === null
}
