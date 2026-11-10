// The PRIVATE bucket that holds original video uploads (ADR rev.1). Named by GCS_VIDEO_SOURCE_BUCKET; there is NO default, so until the owner creates the bucket and sets
// the variable the video routes answer "unavailable" rather than writing somewhere unintended.
//
// The source bucket must never be the public media bucket: a source there would be world-readable, which is exactly what the new pipeline exists to avoid.

import { getMediaProvider } from '../index'
import type { MediaProvider } from '../types'

const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{2,62}$/
/** The bucket every other upload goes to today (public). Same default as getMediaProvider. */
const DEFAULT_PUBLIC_BUCKET = 'tappyai-media-prod'

type Env = Readonly<Record<string, string | undefined>>

/** The configured source bucket, or null when it is unset, malformed, or the same as the public media bucket. */
export function videoSourceBucket(env: Env = process.env): string | null {
  const bucket = env.GCS_VIDEO_SOURCE_BUCKET?.trim()
  if (!bucket || !BUCKET_NAME.test(bucket)) return null
  const publicBucket = (env.GCS_MEDIA_BUCKET?.trim() || DEFAULT_PUBLIC_BUCKET)
  if (bucket === publicBucket) return null
  return bucket
}

/** A provider bound to the source bucket (same impersonated identity as the media provider), or null when the bucket is not configured. */
export function getVideoSourceProvider(
  env: Env = process.env,
  req?: Pick<Request, 'headers'> | null,
  fetchImpl?: typeof fetch,
): { provider: MediaProvider; bucket: string } | null {
  const bucket = videoSourceBucket(env)
  if (!bucket) return null
  return { provider: getMediaProvider({ ...env, GCS_MEDIA_BUCKET: bucket } as unknown as NodeJS.ProcessEnv, req, fetchImpl), bucket }
}
