// Vercel OIDC → Google STS → service-account impersonation.
//
// There is no service-account key anywhere in this flow. Vercel injects a
// short-lived OIDC token into the running deployment; we exchange it for a
// federated token, then impersonate the bucket-scoped media service account.
// Everything stays in memory.
//
// The federation only accepts the production subject
// (owner:…:project:tappyai-mvp:environment:production) — enforced by the
// provider's attribute condition in GCP, not by this code.

export interface WifConfig {
  projectNumber: string
  poolId: string
  providerId: string
  serviceAccountEmail: string
}

export interface WifDeps {
  config: WifConfig
  /** Reads the deployment's OIDC token. Returns null when not running on Vercel. */
  getOidcToken: () => string | null | undefined
  fetchImpl?: typeof fetch
  /** Injectable clock so token caching is testable. */
  now?: () => number
  /**
   * Per-request budget for each credential leg. A stalled STS or
   * IAM Credentials call must fail fast rather than consume the whole
   * Vercel function duration (routes here run with maxDuration = 60).
   */
  timeoutMs?: number
  /** Injectable so timeout behaviour is testable without real waiting. */
  makeTimeoutSignal?: (ms: number) => AbortSignal
}

export const DEFAULT_CREDENTIAL_TIMEOUT_MS = 10_000

/** Where a running Vercel function receives its per-request OIDC token. */
export const VERCEL_OIDC_HEADER = 'x-vercel-oidc-token'

/**
 * The deployment's OIDC token.
 *
 * Vercel exposes it two different ways, and only one of them exists in a
 * deployed function:
 *
 *   builds and local development -> the `VERCEL_OIDC_TOKEN` environment variable
 *   a running Vercel function    -> the `x-vercel-oidc-token` request header
 *
 * Reading only the environment variable therefore works perfectly on a
 * developer machine and is always empty in production, which fails closed at
 * the first stage and never reaches Google. The request wins when both are
 * present: a function can still carry a build-time variable, and the
 * per-request token is the live one.
 */
export function readDeploymentOidcToken(
  req?: Pick<Request, 'headers'> | null,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const fromRequest = req?.headers?.get(VERCEL_OIDC_HEADER)
  if (fromRequest) return fromRequest
  return env.VERCEL_OIDC_TOKEN || null
}

/** Which sources hold an identity. Booleans only — never the token. */
export interface DeploymentIdentitySource {
  source: 'header' | 'env' | 'none'
  headerPresent: boolean
  envPresent: boolean
}

/**
 * Reports WHERE the deployment identity came from, without revealing it.
 *
 * "no deployment identity available" is the same answer whether the platform
 * never injected a token or something between the platform and this handler
 * dropped it, and those have completely different fixes. This distinguishes
 * them while carrying no token, no length and no claims.
 */
export function describeDeploymentIdentity(
  req?: Pick<Request, 'headers'> | null,
  env: NodeJS.ProcessEnv = process.env
): DeploymentIdentitySource {
  const headerPresent = Boolean(req?.headers?.get(VERCEL_OIDC_HEADER))
  const envPresent = Boolean(env.VERCEL_OIDC_TOKEN)
  return {
    source: headerPresent ? 'header' : envPresent ? 'env' : 'none',
    headerPresent,
    envPresent,
  }
}

/** Raised when a credential leg exceeds its time budget. */
export class WifTimeoutError extends Error {
  readonly stage: 'sts' | 'impersonation'
  constructor(stage: 'sts' | 'impersonation', ms: number) {
    super(`Workload Identity Federation timed out at the ${stage} stage after ${ms}ms`)
    this.name = 'WifTimeoutError'
    this.stage = stage
  }
}

/** Raised when federation fails. Carries no token or credential material. */
export class WifExchangeError extends Error {
  readonly stage: 'oidc' | 'sts' | 'impersonation'
  constructor(stage: 'oidc' | 'sts' | 'impersonation', status?: number) {
    super(
      status === undefined
        ? `Workload Identity Federation failed at the ${stage} stage`
        : `Workload Identity Federation failed at the ${stage} stage (HTTP ${status})`
    )
    this.name = 'WifExchangeError'
    this.stage = stage
  }
}

const STS_ENDPOINT = 'https://sts.googleapis.com/v1/token'
const IAMCREDENTIALS = 'https://iamcredentials.googleapis.com/v1'
const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write'
/** Refresh a little early so a token never expires mid-upload. */
const EXPIRY_SKEW_MS = 60_000

export function stsAudience(c: WifConfig): string {
  return (
    `//iam.googleapis.com/projects/${c.projectNumber}` +
    `/locations/global/workloadIdentityPools/${c.poolId}/providers/${c.providerId}`
  )
}

/**
 * Returns a `getAccessToken()` suitable for the GCS provider. The resulting
 * access token is cached in memory until shortly before it expires; it is
 * never written to disk and never logged.
 */
export function createWifTokenSource(deps: WifDeps): () => Promise<string> {
  const doFetch = deps.fetchImpl ?? fetch
  const now = deps.now ?? (() => Date.now())
  const timeoutMs = deps.timeoutMs ?? DEFAULT_CREDENTIAL_TIMEOUT_MS
  const makeSignal = deps.makeTimeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms))
  let cached: { token: string; expiresAt: number } | null = null

  /** Runs one credential leg under a hard time budget. */
  async function bounded(stage: 'sts' | 'impersonation', url: string, init: RequestInit) {
    try {
      return await doFetch(url, { ...init, signal: makeSignal(timeoutMs) })
    } catch (e) {
      const name = (e as { name?: string } | undefined)?.name
      if (name === 'TimeoutError' || name === 'AbortError') throw new WifTimeoutError(stage, timeoutMs)
      throw new WifExchangeError(stage)
    }
  }

  return async function getAccessToken(): Promise<string> {
    if (cached && cached.expiresAt - EXPIRY_SKEW_MS > now()) return cached.token

    const oidc = deps.getOidcToken()
    if (!oidc) throw new WifExchangeError('oidc')

    // 1. Exchange the Vercel OIDC token for a Google federated token.
    const stsRes = await bounded('sts', STS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audience: stsAudience(deps.config),
        grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
        requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
        subjectToken: oidc,
      }),
    })
    if (!stsRes.ok) throw new WifExchangeError('sts', stsRes.status)
    const sts = (await stsRes.json()) as { access_token?: string }
    if (!sts.access_token) throw new WifExchangeError('sts')

    // 2. Impersonate the bucket-scoped service account.
    const impRes = await bounded(
      'impersonation',
      `${IAMCREDENTIALS}/projects/-/serviceAccounts/${encodeURIComponent(
        deps.config.serviceAccountEmail
      )}:generateAccessToken`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sts.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scope: [SCOPE] }),
      }
    )
    if (!impRes.ok) throw new WifExchangeError('impersonation', impRes.status)
    const imp = (await impRes.json()) as { accessToken?: string; expireTime?: string }
    if (!imp.accessToken) throw new WifExchangeError('impersonation')

    const expiresAt = imp.expireTime ? Date.parse(imp.expireTime) : now() + 3_600_000
    cached = { token: imp.accessToken, expiresAt }
    return imp.accessToken
  }
}
