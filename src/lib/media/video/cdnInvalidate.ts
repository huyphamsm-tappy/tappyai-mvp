// A small REST client for the Compute Engine API's cache invalidation (Explore video, takedown). Hand-rolled over fetch, like the Transcoder client (no vendor SDK): one call,
// urlMaps.invalidateCache, which makes Cloud CDN forget a path. The 05/11 spike measured it: the call returns in ~5 s and a deleted object is gone from the edge right after.
//
// Credentials come from Workload Identity Federation impersonating a DEDICATED, scope-limited service account (GCP_CDN_SERVICE_ACCOUNT, no default; it needs only
// compute.urlMaps.invalidateCache on the URL map). The URL map is named by CDN_URL_MAP_NAME (no default). Every failure is a CdnInvalidationError carrying the HTTP status ONLY:
// the provider's body can echo the path (it carries the owner id) and the token must never be logged.
//
// Only a video's own folder (or one owner's folders, for account deletion) can be invalidated; a wider path is refused before any request.

import { createWifTokenSource, readDeploymentOidcToken } from '../gcpAuth'

export class CdnInvalidationError extends Error {
  readonly status: number | undefined
  constructor(status?: number) {
    super(`CDN invalidation failed${status === undefined ? '' : ` (HTTP ${status})`}`)
    this.name = 'CdnInvalidationError'
    this.status = status
  }
}

export interface CdnInvalidator {
  /** `/vdel/<owner>/<asset>/*` (one video) or `/vdel/<owner>/*` (one owner). */
  invalidate(path: string): Promise<void>
}

export interface CdnInvalidatorDeps {
  projectId: string
  urlMapName: string
  getAccessToken: () => Promise<string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const HOST = 'https://compute.googleapis.com/compute/v1'
const PROJECT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
const URL_MAP_RE = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PATH_RE = new RegExp(`^/vdel/${UUID}/(?:${UUID}/)?\\*$`)

export function createCdnInvalidator(deps: CdnInvalidatorDeps): CdnInvalidator {
  if (!PROJECT_RE.test(deps.projectId) || !URL_MAP_RE.test(deps.urlMapName)) throw new RangeError('cdn invalidation: bad project or url map name')
  const doFetch = deps.fetchImpl ?? fetch
  const timeout = deps.timeoutMs ?? 15_000
  const url = `${HOST}/projects/${deps.projectId}/global/urlMaps/${deps.urlMapName}/invalidateCache`
  return {
    async invalidate(path) {
      if (typeof path !== 'string' || !PATH_RE.test(path)) throw new CdnInvalidationError()
      let res: Response
      try {
        const token = await deps.getAccessToken()
        res = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
          signal: AbortSignal.timeout(timeout),
        })
      } catch {
        throw new CdnInvalidationError()
      }
      if (!res.ok) throw new CdnInvalidationError(res.status)
    },
  }
}

type Env = Readonly<Record<string, string | undefined>>

/** The invalidator for this deployment, or null when the URL map or the dedicated service account is not configured (no default for either). */
export function getCdnInvalidator(env: Env = process.env, req?: Pick<Request, 'headers'> | null, fetchImpl?: typeof fetch): CdnInvalidator | null {
  const serviceAccountEmail = env.GCP_CDN_SERVICE_ACCOUNT?.trim()
  const urlMapName = env.CDN_URL_MAP_NAME?.trim()
  if (!serviceAccountEmail || !urlMapName || !URL_MAP_RE.test(urlMapName)) return null
  const projectId = env.GCP_PROJECT_ID?.trim() || 'aerobic-lock-498409-u7'
  if (!PROJECT_RE.test(projectId)) return null
  return createCdnInvalidator({
    projectId,
    urlMapName,
    getAccessToken: createWifTokenSource({
      config: {
        projectNumber: env.GCP_PROJECT_NUMBER ?? '1023373437508',
        poolId: env.GCP_WIF_POOL ?? 'vercel-oidc',
        providerId: env.GCP_WIF_PROVIDER ?? 'vercel',
        serviceAccountEmail,
      },
      getOidcToken: () => readDeploymentOidcToken(req, env as NodeJS.ProcessEnv),
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      ...(fetchImpl ? { fetchImpl } : {}),
    }),
    ...(fetchImpl ? { fetchImpl } : {}),
  })
}
