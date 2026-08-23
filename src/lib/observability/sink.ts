// Construction of a credentialed sink. Kept out of index.ts so that
// `pending.ts` can depend on it without the two forming an import cycle.

import { createWifTokenSource, readDeploymentOidcToken } from '@/lib/media'
import { createCloudLoggingSink, createNoopSink, loggingEnabled, LOGGING_SCOPE, type LogSink } from './cloudLogging'

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
 * Created per request, exactly like `getMediaProvider()`, and for the same
 * reason: on a deployed Vercel function the OIDC token arrives as a per-request
 * header, not as an environment variable. A module-level singleton would
 * capture whatever identity existed at module init — in production, none — and
 * every write would fail at the first credential leg.
 *
 * When the kill switch is off this returns a no-op sink, so call sites never
 * branch on configuration: they always have a sink and it is always safe.
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
