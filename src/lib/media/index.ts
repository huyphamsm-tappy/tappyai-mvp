// The only media surface producers should import.
//
//   putMedia(key, body, { contentType })  -> { url, key }
//   mediaUrl(keyOrAbsoluteUrl)            -> absolute URL
//
// Provider selection is a single env var so the bridge can be turned on, and
// rolled back, without a deploy that touches code:
//
//   MEDIA_PROVIDER=blob   (default — current production behaviour)
//   MEDIA_PROVIDER=gcs    (bridge: new writes land in Cloud Storage)
//
// Existing absolute Blob URLs already persisted in the database are NEVER
// rewritten: `mediaUrl()` passes any absolute URL straight through, so old
// media keeps resolving against Blob regardless of the active provider.

import { createBlobProvider } from './providers/blob'
import { createGcsProvider } from './providers/gcs'
import { createWifTokenSource, readDeploymentOidcToken } from './gcpAuth'
import { isAbsoluteMediaUrl } from './key'
import type { MediaBody, MediaProvider, MediaProviderId, PutMediaResult } from './types'

export * from './types'
export {
  createWifTokenSource,
  readDeploymentOidcToken,
  stsAudience,
  VERCEL_OIDC_HEADER,
  WifExchangeError,
} from './gcpAuth'
export type { WifConfig, WifDeps } from './gcpAuth'
export {
  assertSafeMediaKey,
  isAbsoluteMediaUrl,
  randomMediaSuffix,
  ALLOWED_MEDIA_PREFIXES,
  InvalidMediaKeyError,
} from './key'
export {
  MEDIA_UPLOAD_POLICIES,
  MediaUploadRejectedError,
  resolveUploadTarget,
} from './uploadPolicy'
export type { MediaUploadKind, UploadKindPolicy, UploadTarget } from './uploadPolicy'

export const DEFAULT_MEDIA_PROVIDER: MediaProviderId = 'blob'

export function activeProviderId(env: NodeJS.ProcessEnv = process.env): MediaProviderId {
  return env.MEDIA_PROVIDER === 'gcs' ? 'gcs' : DEFAULT_MEDIA_PROVIDER
}

/**
 * Credentials come from Workload Identity Federation — Vercel's per-deployment
 * OIDC token exchanged for an impersonated, bucket-scoped service account.
 * No service-account key exists; nothing is read from disk.
 *
 * Outside a Vercel deployment there is no OIDC token, so `getOidcToken()`
 * returns null and a GCS write fails closed with WifExchangeError. It never
 * silently falls back to Blob.
 *
 * `req` MATTERS IN PRODUCTION. A deployed Vercel function receives its OIDC
 * token per-request as a header, not as an environment variable, so a caller
 * that omits the request gets a provider with no deployment identity and every
 * GCS write fails at the first stage. Every producer is a route handler, so the
 * request is always in scope — pass it.
 */
export function getMediaProvider(
  env: NodeJS.ProcessEnv = process.env,
  req?: Pick<Request, 'headers'> | null,
  fetchImpl?: typeof fetch
): MediaProvider {
  if (activeProviderId(env) === 'gcs') {
    return createGcsProvider({
      bucket: env.GCS_MEDIA_BUCKET ?? 'tappyai-media-prod',
      getAccessToken: createWifTokenSource({
        config: {
          projectNumber: env.GCP_PROJECT_NUMBER ?? '1023373437508',
          poolId: env.GCP_WIF_POOL ?? 'vercel-oidc',
          providerId: env.GCP_WIF_PROVIDER ?? 'vercel',
          serviceAccountEmail:
            env.GCP_MEDIA_SERVICE_ACCOUNT ??
            'tappyai-media-bridge@aerobic-lock-498409-u7.iam.gserviceaccount.com',
        },
        getOidcToken: () => readDeploymentOidcToken(req, env),
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
      ...(fetchImpl ? { fetchImpl } : {}),
    })
  }
  return createBlobProvider()
}

export async function putMedia(
  key: string,
  body: MediaBody,
  opts: { contentType: string },
  provider: MediaProvider = getMediaProvider()
): Promise<PutMediaResult> {
  return provider.put(key, body, opts)
}

/**
 * Resolve a stored media value to an absolute URL.
 *
 * Absolute URLs (every row in the database today) pass through untouched —
 * this is what keeps existing Vercel Blob media working during the bridge.
 * Bare keys are composed against the active provider, which is the hook that
 * lets a future provider change happen without another DB-wide URL rewrite.
 */
export function mediaUrl(
  value: string,
  provider: MediaProvider = getMediaProvider()
): string {
  if (!value) return value
  if (isAbsoluteMediaUrl(value)) return value
  return provider.publicUrl(value)
}
