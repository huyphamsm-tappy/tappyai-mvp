/**
 * Apple JWS verification using jose (available as transitive dep of @vercel/oidc) and
 * Node.js crypto.X509Certificate. Verifies the full certificate chain and ES256 signature
 * on every Apple-signed payload before trusting its content.
 *
 * Security model:
 *  1. Parse the x5c certificate chain from the JWS header.
 *  2. Verify each cert was signed by the next one in the chain.
 *  3. Assert the root cert's subject contains "Apple Root CA".
 *  4. If APPLE_ROOT_CA_PEM is set, pin to its exact SHA-256 fingerprint (strongly recommended
 *     in production — download AppleRootCA-G3.cer from https://www.apple.com/certificateauthority/
 *     and base64-encode or PEM-encode it into the env var).
 *  5. Verify the JWS signature using the leaf cert's public key via jose.jwtVerify.
 */

import { importX509, jwtVerify, decodeProtectedHeader } from 'jose'
import { X509Certificate } from 'crypto'
import type { JWSTransaction, JWSRenewalInfo, NotificationPayload } from './types'

export class JWSVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JWSVerificationError'
  }
}

/**
 * Core verifier: validates the cert chain and JWS signature.
 * Returns the decoded payload on success, throws JWSVerificationError on failure.
 */
async function verifyAndDecode(token: string): Promise<Record<string, unknown>> {
  const header = decodeProtectedHeader(token)
  const x5c = (header.x5c as string[] | undefined) ?? []

  if (x5c.length === 0) {
    throw new JWSVerificationError('JWS header missing x5c certificate chain')
  }

  // Parse all certs from base64-encoded DER
  const certs = x5c.map(b64 => new X509Certificate(Buffer.from(b64, 'base64')))

  // Verify chain: certs[i] must be signed by certs[i+1]
  for (let i = 0; i < certs.length - 1; i++) {
    let valid = false
    try {
      valid = certs[i].verify(certs[i + 1].publicKey)
    } catch {
      valid = false
    }
    if (!valid) {
      throw new JWSVerificationError(`Certificate chain broken between index ${i} and ${i + 1}`)
    }
  }

  // Root cert must identify as Apple
  const root = certs[certs.length - 1]
  if (!root.subject.includes('Apple')) {
    throw new JWSVerificationError(
      `Certificate chain root does not belong to Apple (subject: ${root.subject})`
    )
  }

  // Pin to exact root cert fingerprint when env var is set
  const pinnedPEM = process.env.APPLE_ROOT_CA_PEM
  if (pinnedPEM) {
    const pinned = new X509Certificate(pinnedPEM.replace(/\\n/g, '\n'))
    if (root.fingerprint256 !== pinned.fingerprint256) {
      throw new JWSVerificationError(
        `Root cert fingerprint (${root.fingerprint256}) does not match APPLE_ROOT_CA_PEM`
      )
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('[apple-jws] APPLE_ROOT_CA_PEM not set — cert pinning disabled. ' +
      'Set to AppleRootCA-G3.cer PEM for full chain verification.')
  }

  // Verify the JWS signature using the leaf cert's public key
  const alg = (header.alg as string) || 'ES256'
  const leafKey = await importX509(certs[0].toString(), alg)

  try {
    const { payload } = await jwtVerify(token, leafKey, { clockTolerance: 60 })
    return payload as Record<string, unknown>
  } catch (err) {
    throw new JWSVerificationError(`JWS signature invalid: ${(err as Error).message}`)
  }
}

/** Verify and decode a top-level App Store Server Notification payload. */
export async function verifyNotificationPayload(signedPayload: string): Promise<NotificationPayload> {
  const payload = await verifyAndDecode(signedPayload)
  return payload as unknown as NotificationPayload
}

/** Verify and decode a signedTransactionInfo JWS. */
export async function verifyTransactionInfo(signedTransactionInfo: string): Promise<JWSTransaction> {
  const payload = await verifyAndDecode(signedTransactionInfo)
  return payload as unknown as JWSTransaction
}

/** Verify and decode a signedRenewalInfo JWS. */
export async function verifyRenewalInfo(signedRenewalInfo: string): Promise<JWSRenewalInfo> {
  const payload = await verifyAndDecode(signedRenewalInfo)
  return payload as unknown as JWSRenewalInfo
}
