// ── FCM HTTP v1 dispatch ─────────────────────────────────────────────────────
//
// The Android transport. Credentials come from the same proven path the media bridge and the voice
// service already use — Vercel OIDC → STS → impersonate a service account — so there is no key
// file, no private key in env, and nothing that outlives the request.
//
// The FCM identity is its OWN service account, never the media or voice one. Each identity holds
// exactly one capability, so a compromise of any of them cannot do the others' jobs.

import { createWifTokenSource, readDeploymentOidcToken } from '@/lib/media/gcpAuth'
import type { NotificationPayload } from './send'
import { notificationKindFrom } from './kind'

/** The only Google scope needed to send an FCM message. Not storage, not speech, not admin. */
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

/**
 * The bundled Android asset, named the way Android resources are referenced: no extension. It
 * corresponds to `res/raw/tappy_identity.wav` in the app.
 *
 * The sound is chosen STRUCTURALLY — the server names a classification, the client maps it to a
 * channel that was created with this asset baked in. The server never sends audio, never sends a
 * URL to audio, and never sends text for a device to speak.
 */
export const IDENTITY_SOUND_ANDROID = 'tappy_identity'

/**
 * What APNs will need later: `aps.sound` takes a file name WITH its extension, and iOS resolves it
 * from the app bundle. Declared here so the contract is written down in one place, and deliberately
 * NOT used by anything below — the Android path must not grow a dependency on it.
 *
 * iOS itself is not implemented. See the V2-03 report.
 */
export const IDENTITY_SOUND_APNS = 'TappyIdentity.wav'

export interface FcmConfig {
  projectNumber: string
  poolId: string
  providerId: string
  serviceAccountEmail: string
  /** The Firebase project the message is sent to — part of the HTTP v1 URL. */
  firebaseProjectId: string
}

/**
 * Reads the FCM identity from env. Null when the deployment has not been configured, which is an
 * expected state, not an error: a deployment without it simply does not send to Android.
 */
export function readFcmConfig(env: NodeJS.ProcessEnv = process.env): FcmConfig | null {
  const projectNumber = env.GCP_PROJECT_NUMBER
  const poolId = env.GCP_WIF_POOL
  const providerId = env.GCP_WIF_PROVIDER
  // Its own variable, with no fallback to the media or voice account. A fallback would quietly
  // route push through an identity that was never meant to have it.
  const serviceAccountEmail = env.GCP_FCM_SERVICE_ACCOUNT
  const firebaseProjectId = env.FIREBASE_PROJECT_ID
  if (!projectNumber || !poolId || !providerId || !serviceAccountEmail || !firebaseProjectId) {
    return null
  }
  return { projectNumber, poolId, providerId, serviceAccountEmail, firebaseProjectId }
}

export function isFcmConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readFcmConfig(env) !== null
}

/**
 * A permanent rejection: this token will never work again. The caller disables the subscription
 * rather than retrying, because retrying a dead token forever is how a send budget gets spent on
 * devices that no longer exist.
 */
export class FcmTokenGoneError extends Error {
  /** Mirrors the web-push error shape the pruning logic in send.ts already understands. */
  readonly statusCode = 404
  constructor(message = 'FCM token is no longer registered') {
    super(message)
    this.name = 'FcmTokenGoneError'
  }
}

/** Anything else — a 5xx, a quota rejection, a network failure. Worth retrying later. */
export class FcmSendError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message)
    this.name = 'FcmSendError'
  }
}

/**
 * Builds the HTTP v1 message body. Pure, so the payload contract can be tested without a network
 * or a credential.
 *
 * DATA-ONLY, deliberately. A message carrying a `notification` block is drawn by the Android system
 * tray itself while the app is backgrounded, and the app's own service never runs — which would
 * silently bypass both the channel selection and the user's `identity_sound_enabled` choice. Sending
 * data only guarantees TappyFirebaseMessagingService decides, every time.
 *
 * Every value is a string because FCM's `data` map is string-to-string; anything else is rejected
 * by the API rather than coerced.
 */
export function buildFcmMessage(token: string, payload: NotificationPayload) {
  // Takes the whole data object, not the kind value — it does the unknown-degrades-to-normal work.
  const kind = notificationKindFrom(payload.data)
  const link = typeof payload.data?.link === 'string' ? payload.data.link : undefined

  const data: Record<string, string> = {
    kind,
    title: payload.title,
    body: payload.body,
    ...(link ? { link } : {}),
  }

  return {
    message: {
      token,
      data,
      android: {
        // Identity notifications are the ones the user is meant to recognise immediately; ordinary
        // ones do not need to wake a dozing device.
        priority: kind === 'tappy_identity' ? 'high' : 'normal',
      },
    },
  }
}

export interface FcmDeps {
  getAccessToken: () => Promise<string>
  config: FcmConfig
  fetchImpl?: typeof fetch
}

/**
 * Sends one message.
 *
 * The provider's response body is never returned to a caller and never logged: it can echo the
 * token and the message content back. Only a classification and a status code leave this function.
 */
export async function sendFcmMessage(
  token: string,
  payload: NotificationPayload,
  deps: FcmDeps
): Promise<void> {
  const doFetch = deps.fetchImpl ?? fetch
  const accessToken = await deps.getAccessToken()

  const res = await doFetch(
    `https://fcm.googleapis.com/v1/projects/${deps.config.firebaseProjectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildFcmMessage(token, payload)),
    }
  )

  if (res.ok) return

  // 404 = the token was deleted; 403 with this API most often means the app was uninstalled or the
  // token belongs to another project. Both are permanent for THIS token.
  if (res.status === 404 || res.status === 403) {
    throw new FcmTokenGoneError()
  }
  // 400 is a malformed message — our bug, not a transient one. Retrying cannot fix it, so it is
  // reported without a retry-worthy status.
  throw new FcmSendError(`FCM send rejected with status ${res.status}`, res.status)
}

/**
 * The dispatcher used by send.ts. Returns a sender, or null when the deployment has no FCM identity
 * configured — the caller then skips Android rather than failing the whole send.
 */
export function createFcmSender(
  req?: Request,
  env: NodeJS.ProcessEnv = process.env
): ((token: string, payload: NotificationPayload) => Promise<void>) | null {
  const config = readFcmConfig(env)
  if (!config) return null

  const getAccessToken = createWifTokenSource({
    config,
    getOidcToken: () => readDeploymentOidcToken(req, env),
    scopes: [FCM_SCOPE],
  })

  return (token, payload) => sendFcmMessage(token, payload, { getAccessToken, config })
}
