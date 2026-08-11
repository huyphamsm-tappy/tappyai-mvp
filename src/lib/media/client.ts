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

import { upload as blobUpload } from '@vercel/blob/client'
import type { MediaUploadKind } from './uploadPolicy'

export const CREATE_UPLOAD_SESSION_TYPE = 'media.create-upload-session'

export interface UploadTransport {
  postJson(
    url: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<{ status: number; json: unknown }>
  putBytes(
    url: string,
    file: Blob,
    contentType: string,
    opts: { signal?: AbortSignal; onProgress?: (percentage: number) => void }
  ): Promise<void>
  blobUpload(
    pathname: string,
    file: Blob,
    opts: Record<string, unknown>
  ): Promise<{ url: string }>
}

export interface UploadMediaInput {
  /** The endpoint that authorizes this upload, e.g. `/api/upload/video`. */
  endpoint: string
  kind: MediaUploadKind
  file: File
  /**
   * The object name used on the legacy Blob path only. Under GCS the server
   * owns the key and this value is never sent.
   */
  legacyPathname: string
  /** Blob's `clientPayload` discriminator, where the legacy route needs one. */
  legacyClientPayload?: string
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
    contentType?: string
  }

  // Blob is still the active provider — take the path that is in production.
  if (session.provider === 'blob') {
    const result = await transport.blobUpload(input.legacyPathname, input.file, {
      access: 'public',
      handleUploadUrl: input.endpoint,
      ...(input.legacyClientPayload === undefined
        ? {}
        : { clientPayload: input.legacyClientPayload }),
      ...(input.signal ? { abortSignal: input.signal } : {}),
      ...(input.onProgress
        ? {
            onUploadProgress: ({ percentage }: { percentage: number }) =>
              input.onProgress?.(percentage),
          }
        : {}),
    })
    return { url: result.url }
  }

  if (!session.uploadUrl || !session.url) {
    throw new MediaUploadError('Không nhận được phiên tải lên hợp lệ.')
  }

  // The session was opened for exactly this content type; send the same one.
  await transport.putBytes(session.uploadUrl, input.file, session.contentType ?? contentType, {
    signal: input.signal,
    onProgress: input.onProgress,
  })

  return { url: session.url }
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
    return new Promise<void>((resolve, reject) => {
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
        // A resumable session completes with 200 or 201; anything else is a
        // failure and must never be reported as a finished upload.
        if (xhr.status === 200 || xhr.status === 201) resolve()
        else reject(new MediaUploadError('Tải lên thất bại.', xhr.status))
      }
      xhr.onerror = () => {
        cleanup()
        reject(new MediaUploadError('Không kết nối được tới kho lưu trữ.'))
      }
      xhr.onabort = () => {
        cleanup()
        reject(new DOMException('Aborted', 'AbortError'))
      }
      xhr.send(file)
    })
  },

  blobUpload(pathname, file, opts) {
    return blobUpload(pathname, file, opts as never)
  },
}
