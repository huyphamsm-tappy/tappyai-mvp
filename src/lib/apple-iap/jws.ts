/**
 * Apple JWS verification using jose (available as transitive dep of @vercel/oidc) and
 * Node.js crypto.X509Certificate. Verifies the full certificate chain and ES256 signature
 * on every Apple-signed payload before trusting its content.
 *
 * Security model:
 *  1. Parse the x5c certificate chain from the JWS header.
 *  2. Verify each cert was issued AND signed by the next one in the chain.
 *  3. The root must be self-signed and its SHA-256 fingerprint must be a PINNED trust anchor:
 *     Apple Root CA - G3, hard-coded below, plus the root in APPLE_ROOT_CA_PEM when that is set.
 *  4. Verify the JWS signature using the leaf cert's public key via jose.jwtVerify.
 *
 * 🚨 THE ROOT'S NAME PROVES NOTHING. The x5c chain arrives in the request, so its root is whatever
 * the sender put there. This file used to accept any root whose subject contained "Apple" and pin
 * only when APPLE_ROOT_CA_PEM happened to be set — without it, anyone could mint their own
 * "Apple Root CA - G3", sign a transaction, and get Pro from /api/iap/apple/verify
 * (security-audit C2). The anchor is now in code, so a missing env var cannot turn it off.
 */

import { importX509, jwtVerify, decodeProtectedHeader } from 'jose'
import { X509Certificate } from 'crypto'
import type { JWSTransaction, JWSRenewalInfo, NotificationPayload } from './types'

/**
 * SHA-256 fingerprint of Apple Root CA - G3 — the root of every App Store Server API and
 * StoreKit 2 signature. Read from https://www.apple.com/certificateauthority/AppleRootCA-G3.cer on
 * 2026-09-27 (valid 2014-04-30 → 2039-04-30); `jws.test.ts` pins it against that certificate.
 */
export const APPLE_ROOT_CA_G3_SHA256 =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79'

/**
 * The roots a chain may end in. Always Apple Root CA - G3; plus the certificate in
 * APPLE_ROOT_CA_PEM when set (optional — room for an Apple root rotation without a deploy). An
 * unreadable APPLE_ROOT_CA_PEM adds nothing and is logged; it can never loosen the check.
 */
export function trustedRootFingerprints(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const anchors = new Set([APPLE_ROOT_CA_G3_SHA256])
  const pem = env.APPLE_ROOT_CA_PEM
  if (pem) {
    try {
      anchors.add(new X509Certificate(pem.replace(/\\n/g, '\n')).fingerprint256)
    } catch {
      console.error('[apple-jws] APPLE_ROOT_CA_PEM is not a readable certificate — ignored; Apple Root CA - G3 is still pinned')
    }
  }
  return anchors
}

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

  // Verify chain: certs[i] must be issued (names) AND signed (key) by certs[i+1]
  for (let i = 0; i < certs.length - 1; i++) {
    let valid = false
    try {
      valid = certs[i].checkIssued(certs[i + 1]) && certs[i].verify(certs[i + 1].publicKey)
    } catch {
      valid = false
    }
    if (!valid) {
      throw new JWSVerificationError(`Certificate chain broken between index ${i} and ${i + 1}`)
    }
  }

  // The root must be a pinned trust anchor — never judged by its name (see the header).
  const root = certs[certs.length - 1]
  if (!trustedRootFingerprints().has(root.fingerprint256)) {
    throw new JWSVerificationError(
      `Certificate chain root is not a pinned Apple root (fingerprint ${root.fingerprint256})`
    )
  }
  let selfSigned = false
  try {
    selfSigned = root.checkIssued(root) && root.verify(root.publicKey)
  } catch {
    selfSigned = false
  }
  if (!selfSigned) {
    throw new JWSVerificationError('Certificate chain root is not self-signed')
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
