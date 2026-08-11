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

/** What the server must know before it will open an upload session. */
export interface UploadSessionRequest {
  /** Server-derived object key. Never taken from the client. */
  key: string
  contentType: string
  /** Declared byte length; bound into the session at init. */
  sizeBytes: number
}

/**
 * A capability to write ONE object.
 *
 * `uploadUrl` is a bearer credential for exactly that key, method and content
 * type — anyone holding it can complete this one upload and nothing else. It is
 * returned to the browser only after authorization, and is never logged or
 * persisted; `url` is the durable value that gets stored.
 */
export interface UploadSession {
  uploadUrl: string
  url: string
  key: string
}

export interface MediaProvider {
  readonly id: MediaProviderId
  put(key: string, body: MediaBody, opts: PutMediaOptions): Promise<PutMediaResult>
  /** Absolute URL for a key stored with THIS provider. */
  publicUrl(key: string): string
  /**
   * Opens a client-direct upload session. Optional: Blob has no equivalent —
   * it uses its own client-token handshake — so the absence of this method is
   * what tells a route to stay on the legacy path.
   */
  createUploadSession?(req: UploadSessionRequest): Promise<UploadSession>
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

/**
 * The provider would not open an upload session. Carries the provider's status
 * code only — never its response body, which can echo request metadata, and
 * never the session URI, which is a bearer capability.
 */
export class MediaUploadSessionError extends Error {
  constructor(provider: MediaProviderId, reason: string, status?: number) {
    super(
      status === undefined
        ? `Media provider "${provider}" did not open an upload session (${reason})`
        : `Media provider "${provider}" did not open an upload session (${reason}, HTTP ${status})`
    )
    this.name = 'MediaUploadSessionError'
  }
}

/** A provider call exceeded its time budget. Mirrors WifTimeoutError's contract. */
export class MediaTimeoutError extends Error {
  constructor(operation: string, ms: number) {
    super(`Media operation "${operation}" timed out after ${ms}ms`)
    this.name = 'MediaTimeoutError'
  }
}
