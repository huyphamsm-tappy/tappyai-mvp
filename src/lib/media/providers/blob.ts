// Vercel Blob provider — the incumbent. Unchanged behaviour: this is exactly
// what the producers did before the bridge, now behind the MediaProvider
// interface so it stays available as the default and as the rollback target.

import { put } from '@vercel/blob'
import type {
  MediaBody,
  MediaProvider,
  PutMediaOptions,
  PutMediaResult,
} from '../types'
import { assertSafeMediaKey } from '../key'

export interface BlobProviderDeps {
  /** Injected for tests; defaults to the real @vercel/blob `put`. */
  putImpl?: typeof put
  /** Public host, only needed to resolve a bare key back to a URL. */
  storeHost?: string
}

export function createBlobProvider(deps: BlobProviderDeps = {}): MediaProvider {
  const putFn = deps.putImpl ?? put

  return {
    id: 'blob',

    publicUrl(key: string) {
      const safeKey = assertSafeMediaKey(key)
      const host = deps.storeHost ?? process.env.BLOB_PUBLIC_HOST ?? ''
      return host ? `${host.replace(/\/$/, '')}/${safeKey}` : safeKey
    },

    async put(key: string, body: MediaBody, opts: PutMediaOptions): Promise<PutMediaResult> {
      const safeKey = assertSafeMediaKey(key)
      const result = await putFn(safeKey, body as Blob, {
        access: 'public',
        contentType: opts.contentType,
      })
      return { url: result.url, key: safeKey }
    },
  }
}
