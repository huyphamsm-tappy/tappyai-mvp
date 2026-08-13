// The only media surface producers should import.
//
//   putMedia(key, body, { contentType })  -> { url, key }
//   mediaUrl(keyOrAbsoluteUrl)            -> absolute URL
//
// Cloud Storage is the only writer. There is no provider switch any more.
//
// The bridge shipped with MEDIA_PROVIDER=blob as the default so GCS could be
// turned on, and rolled back, without touching code. That was right while GCS
// was unproven; it is now the whole risk. An env var that re-enables Blob
// writes means an unset, removed or misspelled value — a new environment, a
// preview deployment, `GCS` in the wrong case — silently returns the app to
// writing Blob objects and re-opens the client-token handshake, which mints
// client-chosen object names. The Blob store reached its transfer ceiling once
// already; the fix is that the path no longer exists, not that it is turned off.
//
// Existing absolute Blob URLs already persisted in the database are NEVER
// rewritten: `mediaUrl()` passes any absolute URL straight through. Filtering
// those out of responses is `servableMedia`'s job, not this module's.

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

export const DEFAULT_MEDIA_PROVIDER: MediaProviderId = 'gcs'

/**
 * Always `gcs`. The parameter is kept so callers need not change and so the
 * invariant is directly testable: no value of MEDIA_PROVIDER selects anything
 * else. The env var is now inert and can be removed from the environment.
 */
export function activeProviderId(_env: NodeJS.ProcessEnv = process.env): MediaProviderId {
  return DEFAULT_MEDIA_PROVIDER
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
