// Browser side of a client-direct upload.
//
// One call for both providers. The page says what kind of thing it is uploading;
// the server decides where it lands. Under GCS the browser PUTs the bytes to a
// resumable session URI it was handed; under Blob the helper makes exactly the
// `upload()` call the pages made before, so rolling the flag back is a no-op for
// this file too.
//
// Transport is injected because the GCS leg needs XMLHttpRequest — `fetch` has
// no upload-progress event, and the video composer's progress bar is not
// something to lose in a storage migration.

import type { MediaUploadKind } from './uploadPolicy'

export const CREATE_UPLOAD_SESSION_TYPE = 'media.create-upload-session'
export const COMPLETE_UPLOAD_TYPE = 'media.complete-upload'

export interface UploadTransport {
  postJson(
    url: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<{ status: number; json: unknown }>
  /**
   * Sends the bytes and reports what could be OBSERVED — not whether it worked.
   *
   * A GCS resumable session answers the PUT with 200 and no `Access-Control-*`
   * headers, so the browser blocks the response and reports status 0. That is
   * indistinguishable from a network failure, so `readable: false` means
   * "unknown", and only the server can settle it.
   */
  putBytes(
    url: string,
    file: Blob,
    contentType: string,
    opts: { signal?: AbortSignal; onProgress?: (percentage: number) => void }
  ): Promise<{ readable: boolean; status: number }>
}

export interface UploadMediaInput {
  /** The endpoint that authorizes this upload, e.g. `/api/upload/video`. */
  endpoint: string
  kind: MediaUploadKind
  file: File
  signal?: AbortSignal
  onProgress?: (percentage: number) => void
}

export interface UploadMediaResult {
  /** The durable public URL to persist. Never the session URI. */
  url: string
}

export class MediaUploadError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'MediaUploadError'
    this.status = status
  }
}

export async function uploadMedia(
  input: UploadMediaInput,
  transport: UploadTransport = defaultTransport
): Promise<UploadMediaResult> {
  const contentType = input.file.type || 'application/octet-stream'

  const res = await transport.postJson(
    input.endpoint,
    {
      type: CREATE_UPLOAD_SESSION_TYPE,
      kind: input.kind,
      contentType,
      size: input.file.size,
    },
    input.signal
  )

  if (res.status !== 200) {
    const message =
      (res.json as { error?: string } | null)?.error ?? 'Tải lên thất bại. Vui lòng thử lại.'
    throw new MediaUploadError(message, res.status)
  }

  const session = res.json as {
    provider?: string
    uploadUrl?: string
    url?: string
    key?: string
    contentType?: string
  }

  // There is no Blob branch any more. The server cannot answer `provider: 'blob'`
  // and this client could not act on it if it did: an upload whose object name
  // the browser chose is exactly what the server-owned key policy exists to stop.
  if (!session.uploadUrl || !session.url) {
    throw new MediaUploadError('Không nhận được phiên tải lên hợp lệ.')
  }

  // The session was opened for exactly this content type; send the same one.
  const put = await transport.putBytes(
    session.uploadUrl,
    input.file,
    session.contentType ?? contentType,
    { signal: input.signal, onProgress: input.onProgress }
  )

  // A response we COULD read that says no is a definite failure — the server
  // has nothing to add, so don't spend a round trip on it.
  if (put.readable && (put.status < 200 || put.status > 299)) {
    throw new MediaUploadError('Tải lên thất bại.', put.status)
  }

  // Otherwise ask the server. It reads the object with its own credential, so
  // it can answer what the browser cannot see. Note this runs even when the PUT
  // looked fine: "looked fine" is not evidence the bytes are all there, and a
  // URL must never be persisted on the strength of an appearance.
  const done = await transport.postJson(
    input.endpoint,
    { type: COMPLETE_UPLOAD_TYPE, kind: input.kind, key: session.key },
    input.signal
  )
  const verdict = done.json as { ok?: boolean; url?: string; error?: string } | null

  if (done.status !== 200 || !verdict?.ok || !verdict.url) {
    throw new MediaUploadError(
      verdict?.error ?? 'Tải lên chưa hoàn tất. Vui lòng thử lại.',
      done.status
    )
  }

  // The server's URL, for an object the server has just seen.
  return { url: verdict.url }
}

const defaultTransport: UploadTransport = {
  async postJson(url, body, signal) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    })
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      /* an empty or non-JSON body is reported through the status alone */
    }
    return { status: res.status, json }
  },

  // XMLHttpRequest rather than fetch: `upload.onprogress` is the only way to
  // drive a real progress bar, and the composer already had one.
  putBytes(url, file, contentType, opts) {
    return new Promise<{ readable: boolean; status: number }>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url, true)
      xhr.setRequestHeader('Content-Type', contentType)

      const onAbort = () => xhr.abort()
      opts.signal?.addEventListener('abort', onAbort, { once: true })
      const cleanup = () => opts.signal?.removeEventListener('abort', onAbort)

      if (opts.onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = () => {
        cleanup()
        resolve({ readable: true, status: xhr.status })
      }
      // NOT a failure — an UNKNOWN. Cloud Storage answers the resumable PUT
      // without CORS headers, so the browser discards a perfectly good 200 and
      // lands here with status 0. Rejecting here is what made completed uploads
      // look broken; the server settles it instead.
      xhr.onerror = () => {
        cleanup()
        resolve({ readable: false, status: xhr.status })
      }
      xhr.onabort = () => {
        cleanup()
        reject(new DOMException('Aborted', 'AbortError'))
      }
      xhr.send(file)
    })
  },
}
