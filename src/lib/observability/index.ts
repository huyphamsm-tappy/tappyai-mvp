// The only observability surface application code should import.
//
//   const sink = getLogSink(process.env, req)
//   sink.log({ type: 'tappyai_usage', … })   // no I/O, cannot throw
//   await sink.flush()                        // never rejects
//
// A sink is created PER REQUEST, exactly like `getMediaProvider()`, and for the
// same reason: on a deployed Vercel function the OIDC token arrives as a
// per-request header, not as an environment variable. A module-level singleton
// would capture whatever identity existed at module init — which in production
// is none — and every write would fail at the first credential leg.
//
// When the kill switch is off, `getLogSink` returns a no-op sink. Call sites do
// not branch on configuration; they always have a sink and it is always safe.

import { createWifTokenSource, readDeploymentOidcToken } from '@/lib/media'
import {
  createCloudLoggingSink,
  createNoopSink,
  loggingEnabled,
  LOGGING_SCOPE,
  type LogSink,
} from './cloudLogging'

export type { LogSink, SinkStats } from './cloudLogging'
export {
  createCloudLoggingSink,
  createNoopSink,
  loggingEnabled,
  LOGGING_SCOPE,
  DEFAULT_FLUSH_TIMEOUT_MS,
  DEFAULT_MAX_BATCH,
  DEFAULT_MAX_BUFFER,
} from './cloudLogging'
export * from './events'

/** Defaults match the provisioned project so a missing variable cannot silently retarget the write. */
const DEFAULT_PROJECT_ID = 'aerobic-lock-498409-u7'
const DEFAULT_PROJECT_NUMBER = '1023373437508'
const DEFAULT_POOL = 'vercel-oidc'
const DEFAULT_PROVIDER = 'vercel'
const DEFAULT_SERVICE_ACCOUNT = 'tappyai-logging@aerobic-lock-498409-u7.iam.gserviceaccount.com'
const DEFAULT_LOG_ID = 'tappyai'

/**
 * A log sink for this request.
 *
 * `req` matters in production — see the note at the top of this file. Every
 * producer is a route handler, so the request is always in scope; pass it.
 */
export function getLogSink(
  env: NodeJS.ProcessEnv = process.env,
  req?: Pick<Request, 'headers'> | null,
  fetchImpl?: typeof fetch
): LogSink {
  if (!loggingEnabled(env)) return createNoopSink()

  return createCloudLoggingSink({
    projectId: env.GCP_PROJECT_ID ?? DEFAULT_PROJECT_ID,
    logId: env.GCP_LOG_ID ?? DEFAULT_LOG_ID,
    enabled: true,
    getAccessToken: createWifTokenSource({
      config: {
        projectNumber: env.GCP_PROJECT_NUMBER ?? DEFAULT_PROJECT_NUMBER,
        poolId: env.GCP_WIF_POOL ?? DEFAULT_POOL,
        providerId: env.GCP_WIF_PROVIDER ?? DEFAULT_PROVIDER,
        serviceAccountEmail: env.GCP_LOGGING_SERVICE_ACCOUNT ?? DEFAULT_SERVICE_ACCOUNT,
      },
      getOidcToken: () => readDeploymentOidcToken(req, env),
      // Narrow scope: this identity may write logs and do nothing else.
      scopes: [LOGGING_SCOPE],
      ...(fetchImpl ? { fetchImpl } : {}),
    }),
    ...(fetchImpl ? { fetchImpl } : {}),
  })
}
