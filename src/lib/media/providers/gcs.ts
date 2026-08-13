// Google Cloud Storage provider — the bridge target.
//
// Credential injection is EXPLICIT: the caller supplies `getAccessToken`.
// Nothing in this file reads a service-account JSON key, and no key material
// is stored anywhere in the repo. Until a credential strategy is approved,
// production wiring passes `getAccessToken: null` and every write fails loudly
// with MediaCredentialsUnavailableError rather than silently succeeding.
//
// Deliberately uses the JSON API over `fetch` instead of @google-cloud/storage:
// no new dependency, and fully mockable in tests.

import {
  MediaCredentialsUnavailableError,
  MediaTimeoutError,
  MediaUploadFailedError,
  MediaUploadSessionError,
  type MediaBody,
  type MediaProvider,
  type PutMediaOptions,
  type PutMediaResult,
  type UploadSession,
  type UploadSessionRequest,
} from '../types'
import { assertSafeMediaKey } from '../key'

export interface GcsProviderDeps {
  bucket: string
  /** Returns an OAuth2 bearer token for the bucket-scoped service account. */
  getAccessToken: (() => Promise<string>) | null
  fetchImpl?: typeof fetch
  /**
   * Budget for opening an upload session. This is a metadata round-trip, not a
   * byte transfer, so it must fail fast rather than eat the function duration.
   * It deliberately does NOT apply to `put()`, which streams real bytes.
   */
  timeoutMs?: number
  /** Injectable so the budget is testable without real waiting. */
  makeTimeoutSignal?: (ms: number) => AbortSignal
}

const UPLOAD_HOST = 'https://storage.googleapis.com'

export const DEFAULT_SESSION_TIMEOUT_MS = 10_000

export function gcsPublicUrl(bucket: string, key: string): string {
  return `${UPLOAD_HOST}/${bucket}/${key}`
}

export function createGcsProvider(deps: GcsProviderDeps): MediaProvider {
  const doFetch = deps.fetchImpl ?? fetch
  const timeoutMs = deps.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
  const makeSignal = deps.makeTimeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms))

  return {
    id: 'gcs',

    publicUrl(key: string) {
      return gcsPublicUrl(deps.bucket, assertSafeMediaKey(key))
    },

    async put(key: string, body: MediaBody, opts: PutMediaOptions): Promise<PutMediaResult> {
      const safeKey = assertSafeMediaKey(key)
      if (!deps.getAccessToken) throw new MediaCredentialsUnavailableError('gcs')

      const token = await deps.getAccessToken()
      const url =
        `${UPLOAD_HOST}/upload/storage/v1/b/${encodeURIComponent(deps.bucket)}/o` +
        `?uploadType=media&name=${encodeURIComponent(safeKey)}`

      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': opts.contentType,
        },
        body: body as BodyInit,
      })

      // A non-2xx must never be reported as success. The provider's response
      // body is intentionally NOT echoed — it can contain request metadata.
      if (!res.ok) throw new MediaUploadFailedError('gcs', res.status)

      return { url: gcsPublicUrl(deps.bucket, safeKey), key: safeKey }
    },

    /**
     * Opens a resumable upload session and returns its URI.
     *
     * This is the keyless alternative to a V4 signed URL: signing an URL would
     * need `iam.serviceAccounts.signBlob`, which lives in a role our federated
     * principal deliberately does not hold. `storage.objects.create` — which it
     * does hold — is enough to open a session, and the session URI is what the
     * browser then PUTs to, carrying no credential of its own.
     *
     * The session is bound at init to one object name, and to the content type
     * and byte length declared here. The returned URI is a bearer capability
     * for that one write: it is handed back only to an authorized caller, and
     * neither logged nor persisted.
     */
    async createUploadSession(req: UploadSessionRequest): Promise<UploadSession> {
      const safeKey = assertSafeMediaKey(req.key)
      if (!deps.getAccessToken) throw new MediaCredentialsUnavailableError('gcs')

      const token = await deps.getAccessToken()
      const url =
        `${UPLOAD_HOST}/upload/storage/v1/b/${encodeURIComponent(deps.bucket)}/o` +
        `?uploadType=resumable&name=${encodeURIComponent(safeKey)}`

      let res: Response
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=UTF-8',
            // These two are what bind the session. GCS rejects a PUT whose
            // content type or total length disagrees with what was declared.
            'X-Upload-Content-Type': req.contentType,
            'X-Upload-Content-Length': String(req.sizeBytes),
          },
          body: '{}',
          signal: makeSignal(timeoutMs),
        })
      } catch (e) {
        const name = (e as { name?: string } | undefined)?.name
        if (name === 'TimeoutError' || name === 'AbortError') {
          throw new MediaTimeoutError('upload session', timeoutMs)
        }
        throw new MediaUploadSessionError('gcs', 'the request failed')
      }

      if (!res.ok) throw new MediaUploadSessionError('gcs', 'refused', res.status)

      const uploadUrl = res.headers?.get('location')
      // A 2xx without a Location is not a session. Treating it as one would
      // hand the browser `null` to PUT at.
      if (!uploadUrl) throw new MediaUploadSessionError('gcs', 'no session URI was returned')

      return { uploadUrl, url: gcsPublicUrl(deps.bucket, safeKey), key: safeKey }
    },

    /**
     * Reads an object's metadata, or null when it is not there.
     *
     * This is how a client-direct upload gets confirmed: the browser's PUT
     * response is CORS-blocked, so the browser genuinely cannot tell whether
     * its bytes landed. We can — `storage.objects.get` is already in the
     * bucket-scoped role, so this needs no new IAM.
     *
     * A 404 is an answer, not an error: it means the upload did not complete.
     */
    async statObject(key: string) {
      const safeKey = assertSafeMediaKey(key)
      if (!deps.getAccessToken) throw new MediaCredentialsUnavailableError('gcs')

      const token = await deps.getAccessToken()
      const url =
        `${UPLOAD_HOST}/storage/v1/b/${encodeURIComponent(deps.bucket)}` +
        `/o/${encodeURIComponent(safeKey)}`

      let res: Response
      try {
        res = await doFetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: makeSignal(timeoutMs),
        })
      } catch (e) {
        const name = (e as { name?: string } | undefined)?.name
        if (name === 'TimeoutError' || name === 'AbortError') {
          throw new MediaTimeoutError('object lookup', timeoutMs)
        }
        throw new MediaUploadSessionError('gcs', 'the lookup failed')
      }

      if (res.status === 404) return null
      if (!res.ok) throw new MediaUploadSessionError('gcs', 'lookup refused', res.status)

      const meta = (await res.json()) as { size?: string; contentType?: string }
      return {
        // GCS returns size as a string; a missing or unparseable size counts as
        // zero so an unverifiable object can never pass as complete.
        size: Number.parseInt(meta.size ?? '0', 10) || 0,
        contentType: meta.contentType ?? '',
      }
    },
  }
}
