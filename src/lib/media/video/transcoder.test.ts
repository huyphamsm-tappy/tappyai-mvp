import { describe, it, expect, vi } from 'vitest'
import { createTranscoderClient, getTranscoderClient, TranscoderError } from './transcoder'
import { buildTranscodeJob } from './transcodeConfig'

const NUMBER = '1023373437508'
const LOC = 'asia-southeast1'
const NAME = `projects/${NUMBER}/locations/${LOC}/jobs/62498ec2-f67a-4757-81b0-eb60b6ad3673`
const JOB = buildTranscodeJob({ inputUri: 'gs://bkt-src/vsrc/o/k.mp4', outputUri: 'gs://bkt-src/vstg/o/a/', width: 1080, height: 1920, hasAudio: true })

function fakeFetch(res: { status: number; body?: unknown } | Error) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    if (res instanceof Error) throw res
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), { status: res.status })
  }) as unknown as typeof fetch
  return { fn, calls }
}
const client = (f: typeof fetch) => createTranscoderClient({ projectNumber: NUMBER, location: LOC, getAccessToken: async () => 'tok-123', fetchImpl: f })

describe('createJob', () => {
  it('POSTs the job body to the project and location, with the bearer token, and returns the job name', async () => {
    const f = fakeFetch({ status: 200, body: { name: NAME, state: 'PENDING' } })
    expect(await client(f.fn).createJob(JOB)).toEqual({ name: NAME })
    expect(f.calls[0].url).toBe(`https://transcoder.googleapis.com/v1/projects/${NUMBER}/locations/${LOC}/jobs`)
    expect(f.calls[0].init.method).toBe('POST')
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual(JSON.parse(JSON.stringify(JOB)))
  })

  it('a response without a valid job name is an error (never an id we invented)', async () => {
    for (const body of [{}, { name: 'projects/1/locations/x/jobs/' }, { name: 'https://evil/x' }, { name: `projects/999/locations/${LOC}/jobs/abc` }]) {
      await expect(client(fakeFetch({ status: 200, body }).fn).createJob(JOB)).rejects.toBeInstanceOf(TranscoderError)
    }
  })

  it('🚨 a refused call throws with the operation and status ONLY: no body, no token, no object name', async () => {
    const f = fakeFetch({ status: 403, body: { error: { message: 'permission denied on gs://b/vsrc/o/k.mp4 for tok-123' } } })
    const err = await client(f.fn).createJob(JOB).catch(e => e)
    expect(err).toBeInstanceOf(TranscoderError)
    expect(err.message).toBe('Transcoder create failed (HTTP 403)')
    expect(JSON.stringify(err)).not.toMatch(/tok-123|vsrc/)
  })

  it('a network failure or timeout is a TranscoderError too, without the underlying message', async () => {
    const err = await client(fakeFetch(new Error('connect ETIMEDOUT 1.2.3.4')).fn).createJob(JOB).catch(e => e)
    expect(err).toBeInstanceOf(TranscoderError)
    expect(err.message).not.toMatch(/ETIMEDOUT|1\.2\.3\.4/)
  })

  it('asks for a bounded time (an abort signal is passed)', async () => {
    const f = fakeFetch({ status: 200, body: { name: NAME } })
    await client(f.fn).createJob(JOB)
    expect(f.calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('getJob', () => {
  it.each(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const)('maps %s', async (state) => {
    const f = fakeFetch({ status: 200, body: { name: NAME, state, ...(state === 'FAILED' ? { error: { code: 3, message: 'secret detail' } } : {}) } })
    const r = await client(f.fn).getJob(NAME)
    expect(r.state).toBe(state)
    if (state === 'FAILED') expect(r).toEqual({ state: 'FAILED', errorCode: 3 })
    expect(JSON.stringify(r)).not.toContain('secret detail')
    expect(f.calls[0].url).toBe(`https://transcoder.googleapis.com/v1/${NAME}`)
    expect(f.calls[0].init.method).toBe('GET')
  })

  it('an unknown or missing state is UNKNOWN, which the caller treats as "not finished"', async () => {
    expect((await client(fakeFetch({ status: 200, body: { name: NAME, state: 'PROCESSING_STATE_UNSPECIFIED' } }).fn).getJob(NAME)).state).toBe('UNKNOWN')
    expect((await client(fakeFetch({ status: 200, body: {} }).fn).getJob(NAME)).state).toBe('UNKNOWN')
  })

  it('🚨 refuses a job name that is not THIS project and location before any request (a stored value cannot redirect the call)', async () => {
    const f = fakeFetch({ status: 200, body: {} })
    for (const bad of ['', 'x', `projects/999/locations/${LOC}/jobs/abc`, `projects/${NUMBER}/locations/us-central1/jobs/abc`, `projects/${NUMBER}/locations/${LOC}/jobs/../x`, `https://evil.example/${NAME}`, `${NAME}?x=1`]) {
      await expect(client(f.fn).getJob(bad), bad).rejects.toBeInstanceOf(TranscoderError)
    }
    expect(f.calls).toHaveLength(0)
  })

  it('a missing job (404) and a server error are distinguishable by status, and carry no body', async () => {
    const e404 = await client(fakeFetch({ status: 404, body: { error: 'x' } }).fn).getJob(NAME).catch(e => e)
    expect(e404.status).toBe(404)
    const e500 = await client(fakeFetch({ status: 503 }).fn).getJob(NAME).catch(e => e)
    expect(e500.status).toBe(503)
    expect(e500.message).toBe('Transcoder get failed (HTTP 503)')
  })
})

describe('getTranscoderClient (from the environment)', () => {
  it('is null until the transcoder service account is configured: NO default identity', () => {
    expect(getTranscoderClient({}, null)).toBeNull()
    expect(getTranscoderClient({ GCP_TRANSCODER_SERVICE_ACCOUNT: '  ' }, null)).toBeNull()
  })

  it('builds a client from the environment, with the transcoder location defaulting to Singapore', () => {
    const c = getTranscoderClient({ GCP_TRANSCODER_SERVICE_ACCOUNT: 'transcoder-bridge@aerobic-lock-498409-u7.iam.gserviceaccount.com' }, null)
    expect(c).not.toBeNull()
    expect(typeof c!.createJob).toBe('function')
    expect(c!.location).toBe('asia-southeast1')
    expect(getTranscoderClient({ GCP_TRANSCODER_SERVICE_ACCOUNT: 'x@y.iam.gserviceaccount.com', GCP_TRANSCODER_LOCATION: 'asia-east1' }, null)!.location).toBe('asia-east1')
  })

  it('rejects a malformed location instead of building a URL from it', () => {
    expect(getTranscoderClient({ GCP_TRANSCODER_SERVICE_ACCOUNT: 'x@y.iam.gserviceaccount.com', GCP_TRANSCODER_LOCATION: 'a/b?c' }, null)).toBeNull()
  })
})

void vi
