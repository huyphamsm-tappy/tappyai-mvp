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
  let cached: { token: string; expiresAt: number } | null = null

  return async function getAccessToken(): Promise<string> {
    if (cached && cached.expiresAt - EXPIRY_SKEW_MS > now()) return cached.token

    const oidc = deps.getOidcToken()
    if (!oidc) throw new WifExchangeError('oidc')

    // 1. Exchange the Vercel OIDC token for a Google federated token.
    const stsRes = await doFetch(STS_ENDPOINT, {
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
    const impRes = await doFetch(
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
