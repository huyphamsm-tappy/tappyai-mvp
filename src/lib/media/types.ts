// Storage-provider-agnostic media contract.
//
// Callers never name a provider. They hand us a *key* (`avatars/<id>.jpg`) and
// get back an absolute public URL — the same shape `@vercel/blob`'s `put()`
// returned — so API responses, the database and the Android client are all
// unaffected by which provider is behind this.

export type MediaProviderId = 'blob' | 'gcs'

export interface PutMediaResult {
  /** Absolute, publicly readable URL. This is what gets persisted. */
  url: string
  /** Provider-independent object key, e.g. `avatars/<uuid>.jpg`. */
  key: string
}

export type MediaBody = Blob | ArrayBuffer | Uint8Array

export interface PutMediaOptions {
  contentType: string
}

export interface MediaProvider {
  readonly id: MediaProviderId
  put(key: string, body: MediaBody, opts: PutMediaOptions): Promise<PutMediaResult>
  /** Absolute URL for a key stored with THIS provider. */
  publicUrl(key: string): string
}

/**
 * Thrown when a provider is selected but its credentials were never injected.
 * Deliberately carries no credential material — see `media.test.ts`.
 */
export class MediaCredentialsUnavailableError extends Error {
  constructor(provider: MediaProviderId) {
    super(`Media provider "${provider}" has no credentials configured`)
    this.name = 'MediaCredentialsUnavailableError'
  }
}

/** Upload reached the provider and the provider refused it. Never swallowed. */
export class MediaUploadFailedError extends Error {
  constructor(provider: MediaProviderId, status: number) {
    super(`Media provider "${provider}" rejected the upload (HTTP ${status})`)
    this.name = 'MediaUploadFailedError'
  }
}
