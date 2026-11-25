// A small REST client for the Google Transcoder API (Explore video part 4). Hand-rolled over fetch, like the Cloud Storage provider (no vendor SDK): two calls, create a job and
// read a job. Credentials come from Workload Identity Federation, impersonating a DEDICATED service account (GCP_TRANSCODER_SERVICE_ACCOUNT, no default: the media bridge account
// is deliberately storage-only and is not widened). Every failure is a TranscoderError carrying the operation and the HTTP status ONLY: the provider's body can echo object
// names (they carry the owner id) and the token must never be logged.

import { createWifTokenSource, readDeploymentOidcToken } from '../gcpAuth'

export type TranscoderJobState = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'

export class TranscoderError extends Error {
  readonly status: number | undefined
  constructor(operation: 'create' | 'get' | 'name', status?: number) {
    super(operation === 'name' ? 'Transcoder job name is not valid' : `Transcoder ${operation} failed${status === undefined ? '' : ` (HTTP ${status})`}`)
    this.name = 'TranscoderError'
    this.status = status
  }
}

export interface TranscoderClient {
  readonly location: string
  createJob(job: object): Promise<{ name: string }>
  getJob(name: string): Promise<{ state: TranscoderJobState; errorCode?: number }>
}

export interface TranscoderDeps {
  projectNumber: string
  location: string
  getAccessToken: () => Promise<string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const HOST = 'https://transcoder.googleapis.com/v1'
const LOCATION_RE = /^[a-z]+-[a-z]+[0-9]+$/
const STATES = new Set(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'])

export function createTranscoderClient(deps: TranscoderDeps): TranscoderClient {
  const doFetch = deps.fetchImpl ?? fetch
  const timeout = deps.timeoutMs ?? 15_000
  const nameRe = new RegExp(`^projects/${deps.projectNumber}/locations/${deps.location}/jobs/[A-Za-z0-9][A-Za-z0-9-]*$`)

  async function call(operation: 'create' | 'get', url: string, init: RequestInit): Promise<unknown> {
    let res: Response
    try {
      const token = await deps.getAccessToken()
      res = await doFetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeout) })
    } catch {
      throw new TranscoderError(operation)
    }
    if (!res.ok) throw new TranscoderError(operation, res.status)
    try { return await res.json() } catch { throw new TranscoderError(operation) }
  }

  return {
    location: deps.location,

    async createJob(job) {
      const body = (await call('create', `${HOST}/projects/${deps.projectNumber}/locations/${deps.location}/jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job),
      })) as { name?: unknown }
      // The name is stored and used later: only one that belongs to THIS project and location is accepted.
      if (typeof body?.name !== 'string' || !nameRe.test(body.name)) throw new TranscoderError('create')
      return { name: body.name }
    },

    async getJob(name) {
      if (typeof name !== 'string' || !nameRe.test(name)) throw new TranscoderError('name')
      const body = (await call('get', `${HOST}/${name}`, { method: 'GET', headers: {} })) as { state?: unknown; error?: { code?: unknown } }
      const state: TranscoderJobState = typeof body?.state === 'string' && STATES.has(body.state) ? (body.state as TranscoderJobState) : 'UNKNOWN'
      return state === 'FAILED' && typeof body.error?.code === 'number' ? { state, errorCode: body.error.code } : { state }
    },
  }
}

type Env = Readonly<Record<string, string | undefined>>

/**
 * The client for this deployment, or null when no transcoder service account is configured (the feature then cannot start a job, and says so). The project number and
 * the identity pool are the ones the media provider already uses; only the service account and the scope differ.
 */
export function getTranscoderClient(env: Env = process.env, req?: Pick<Request, 'headers'> | null, fetchImpl?: typeof fetch): TranscoderClient | null {
  const serviceAccountEmail = env.GCP_TRANSCODER_SERVICE_ACCOUNT?.trim()
  if (!serviceAccountEmail) return null
  const location = env.GCP_TRANSCODER_LOCATION?.trim() || 'asia-southeast1'
  if (!LOCATION_RE.test(location)) return null
  const projectNumber = env.GCP_PROJECT_NUMBER ?? '1023373437508'
  return createTranscoderClient({
    projectNumber,
    location,
    getAccessToken: createWifTokenSource({
      config: {
        projectNumber,
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
