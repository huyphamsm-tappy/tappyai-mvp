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
  MediaUploadFailedError,
  type MediaBody,
  type MediaProvider,
  type PutMediaOptions,
  type PutMediaResult,
} from '../types'
import { assertSafeMediaKey } from '../key'

export interface GcsProviderDeps {
  bucket: string
  /** Returns an OAuth2 bearer token for the bucket-scoped service account. */
  getAccessToken: (() => Promise<string>) | null
  fetchImpl?: typeof fetch
}

const UPLOAD_HOST = 'https://storage.googleapis.com'

export function gcsPublicUrl(bucket: string, key: string): string {
  return `${UPLOAD_HOST}/${bucket}/${key}`
}

export function createGcsProvider(deps: GcsProviderDeps): MediaProvider {
  const doFetch = deps.fetchImpl ?? fetch

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
  }
}
