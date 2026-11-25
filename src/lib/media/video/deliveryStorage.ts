// The DELIVERY bucket of Explore video (ADR rev.1 / rev.2): the approved HLS copy of a video, PRIVATE, read only by Cloud CDN (signed cookies) and written only by the server.
// Named by GCS_VIDEO_DELIVERY_BUCKET; there is NO default, so until the owner creates the bucket and sets the variable, promotion and playback answer "unavailable".
//
// It must be a DIFFERENT bucket from the public media bucket (a copy there would be world-readable) and from the private source bucket (the original and the moderation
// evidence must never share a bucket with something served to viewers).

import { getMediaProvider } from '../index'
import type { MediaProvider } from '../types'
import { videoSourceBucket } from './sourceStorage'

const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{2,62}$/
const DEFAULT_PUBLIC_BUCKET = 'tappyai-media-prod'

type Env = Readonly<Record<string, string | undefined>>

/** The configured delivery bucket, or null when it is unset, malformed, or the same as the public media bucket or the source bucket. */
export function videoDeliveryBucket(env: Env = process.env): string | null {
  const bucket = env.GCS_VIDEO_DELIVERY_BUCKET?.trim()
  if (!bucket || !BUCKET_NAME.test(bucket)) return null
  const publicBucket = env.GCS_MEDIA_BUCKET?.trim() || DEFAULT_PUBLIC_BUCKET
  if (bucket === publicBucket) return null
  if (bucket === videoSourceBucket(env) || bucket === env.GCS_VIDEO_SOURCE_BUCKET?.trim()) return null
  // Compared against the RAW source variable too, so a source bucket that is itself malformed cannot hide a collision.
  return bucket
}

/** A provider bound to the delivery bucket (same impersonated identity as the media provider), or null when the bucket is not configured. */
export function getVideoDeliveryProvider(
  env: Env = process.env,
  req?: Pick<Request, 'headers'> | null,
  fetchImpl?: typeof fetch,
): { provider: MediaProvider; bucket: string } | null {
  const bucket = videoDeliveryBucket(env)
  if (!bucket) return null
  return { provider: getMediaProvider({ ...env, GCS_MEDIA_BUCKET: bucket } as unknown as NodeJS.ProcessEnv, req, fetchImpl), bucket }
}
