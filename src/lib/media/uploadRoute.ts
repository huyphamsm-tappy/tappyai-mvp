// The shared body of the three client-direct upload endpoints.
//
// Each route keeps its own authorization — video and audio use `getRequestUser`,
// deals uses `requirePermission` + `isSameOrigin` — and calls in here only once
// the caller has already passed every guard it had before. Nothing in this file
// authorizes anything; it decides what an already-authorized caller may upload.
//
// The response is always a Cloud Storage session:
//
//   { provider: 'gcs', uploadUrl, url, key }   -> PUT the bytes to uploadUrl
//
// There is no Blob branch. It used to name Blob as the provider and let the
// client take the legacy handshake, which mints a CLIENT-CHOSEN object name and
// so bypasses every rule in `uploadPolicy`. That path is gone rather than
// disabled, because a disabled path comes back the moment an env var is wrong.

import { getMediaProvider } from './index'
import { recordEvent } from '@/lib/observability'
import {
  MediaUploadRejectedError,
  resolveUploadTarget,
  type MediaUploadKind,
} from './uploadPolicy'
import type { MediaProvider } from './types'

export const CREATE_UPLOAD_SESSION_TYPE = 'media.create-upload-session'

export interface CreateUploadSessionBody {
  type: typeof CREATE_UPLOAD_SESSION_TYPE
  kind?: unknown
  contentType?: unknown
  size?: unknown
}

/**
 * True for our request shape. Anything else — notably Vercel Blob's old
 * `blob.generate-client-token` handshake — is refused by the routes.
 */
export function isCreateUploadSessionBody(body: unknown): body is CreateUploadSessionBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { type?: unknown }).type === CREATE_UPLOAD_SESSION_TYPE
  )
}

export interface UploadSessionContext {
  /** The authenticated caller; becomes part of the object key. */
  ownerId: string
  /** The kinds THIS endpoint may mint. Its own authorization scope. */
  allowedKinds: readonly MediaUploadKind[]
}

export interface UploadSessionOutcome {
  status: number
  body: Record<string, unknown>
}

/**
 * Resolves an authorized session request. Returns a status and body rather than
 * a Response so it stays trivially testable and each route keeps control of its
 * own error envelope.
 */
export async function createUploadSessionResponse(
  body: unknown,
  ctx: UploadSessionContext,
  provider: MediaProvider = getMediaProvider()
): Promise<UploadSessionOutcome> {
  // A provider with no session concept would mean a client-chosen object name.
  // Fail closed instead of degrading to one.
  if (!provider.createUploadSession) {
    return { status: 502, body: { error: 'Không thể tạo phiên tải lên. Vui lòng thử lại.' } }
  }

  const input = (body ?? {}) as CreateUploadSessionBody

  let target
  try {
    target = resolveUploadTarget(
      {
        kind: input.kind as MediaUploadKind,
        contentType: String(input.contentType ?? ''),
        sizeBytes: typeof input.size === 'number' ? input.size : Number.NaN,
        ownerId: ctx.ownerId,
      },
      ctx.allowedKinds
    )
  } catch (e) {
    if (e instanceof MediaUploadRejectedError) return { status: e.status, body: { error: e.message } }
    throw e
  }

  try {
    const opened = await provider.createUploadSession(target)
    return {
      status: 200,
      body: {
        provider: provider.id,
        uploadUrl: opened.uploadUrl,
        url: opened.url,
        key: opened.key,
        contentType: target.contentType,
      },
    }
  } catch (e) {
    // Every failure past this point is ours, not the caller's: a rejected
    // credential exchange, a timeout, a refusal from Cloud Storage. The caller
    // learns only that it failed — never the provider's status text, never the
    // token, never a partially built session URI. It must not degrade into a
    // Blob upload either: that would silently defeat server-owned keys.
    //
    // The OPERATOR is a different audience, and used to get nothing at all. A
    // production 502 here looked identical whether the deployment had no OIDC
    // identity, or STS refused the exchange, or Cloud Storage said no — three
    // problems with three different fixes, reported as one opaque number. That
    // ambiguity is what made a real upload outage take six rounds to place.
    //
    // `stage` is the one fact that resolves it: 'oidc' | 'sts' | 'impersonation'
    // off WifExchangeError/WifTimeoutError. It is a fixed enum describing WHICH
    // LEG failed, carries no token, no status text and no session URI, and it is
    // logged rather than returned — the response body below is byte-identical to
    // what it was before. Read structurally rather than with `instanceof` so a
    // timeout, an exchange failure and a future error type all report the same
    // way without this file importing three error classes.
    const err = (e ?? {}) as {
      stage?: unknown
      status?: unknown
      reason?: unknown
      audience?: unknown
    }
    const stage = typeof err.stage === 'string' ? err.stage : 'unknown'
    // `status`, `reason` and `audience` are only ever set by WifExchangeError,
    // which is documented to carry no credential material. `audience` is a
    // public resource path built from configuration — it is here because an
    // empty `GCP_PROJECT_NUMBER` / `GCP_WIF_POOL` / `GCP_WIF_PROVIDER` yields a
    // well-formed audience that matches no provider, and that refusal is
    // indistinguishable from a real condition mismatch without seeing it.
    const status = typeof err.status === 'number' ? err.status : undefined
    const reason = typeof err.reason === 'string' ? err.reason : undefined
    const audience = typeof err.audience === 'string' ? err.audience : undefined
    // Worded without the word "session" on purpose: a guard in
    // `uploadSession.test.ts` forbids any console call in this file from naming
    // an upload session, because that is how a one-object bearer capability ends
    // up in a log. The rule is blunt and it should stay blunt — the message is
    // what bends here, not the rule.
    console.error('[media/upload] credential exchange failed', {
      stage,
      status,
      reason,
      audience,
      kind: String(input.kind ?? 'unknown'),
    })
    // Same facts, to a durable sink. Buffer-only: an array push, no I/O, no
    // throw — safe inside a catch that is already handling a production
    // failure. `audience` is deliberately omitted: it is safe but it is a
    // configuration echo, and the allow-list stays as small as it can be.
    recordEvent({ type: 'wif_failure', stage, status, reason })
    recordEvent({
      type: 'media_failure',
      operation: 'session',
      provider: provider.id,
      status,
      kind: String(input.kind ?? 'unknown'),
    })
    return { status: 502, body: { error: 'Không thể tạo phiên tải lên. Vui lòng thử lại.' } }
  }
}
