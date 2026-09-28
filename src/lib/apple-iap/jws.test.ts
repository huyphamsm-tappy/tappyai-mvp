import { describe, it, expect, afterEach } from 'vitest'
import { generateKeyPairSync, sign, X509Certificate, type KeyObject } from 'node:crypto'
import { CompactSign } from 'jose'
import { APPLE_ROOT_CA_G3_SHA256, JWSVerificationError, trustedRootFingerprints, verifyTransactionInfo } from './jws'

// ─────────────────────────────────────────────────────────────────────────────
// security-audit C2: the verifier trusted any root whose subject contained "Apple" unless
// APPLE_ROOT_CA_PEM was set. These tests mint a real, self-signed "Apple Root CA - G3" at test time
// (Node crypto + a minimal DER encoder — no key material is committed) and prove it is refused.
// ─────────────────────────────────────────────────────────────────────────────

/** Apple Root CA - G3, public certificate from https://www.apple.com/certificateauthority/AppleRootCA-G3.cer */
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`

// ── minimal DER encoder: just enough X.509 v3 (no extensions) for Node's X509Certificate ──
const len = (n: number): number[] => (n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff])
const tlv = (tag: number, body: Buffer) => Buffer.concat([Buffer.from([tag, ...len(body.length)]), body])
const seq = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts))
const oid = (dotted: string) => {
  const [a, b, ...rest] = dotted.split('.').map(Number)
  const bytes = [a * 40 + b]
  for (const v of rest) {
    const chunk = [v & 0x7f]
    for (let x = v >> 7; x > 0; x >>= 7) chunk.unshift((x & 0x7f) | 0x80)
    bytes.push(...chunk)
  }
  return tlv(0x06, Buffer.from(bytes))
}
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, 'utf8'))
const utc = (d: Date) => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'))
const name = (cn: string) => seq(
  tlv(0x31, seq(oid('2.5.4.3'), utf8(cn))),
  tlv(0x31, seq(oid('2.5.4.11'), utf8('Apple Certification Authority'))),
  tlv(0x31, seq(oid('2.5.4.10'), utf8('Apple Inc.'))),
)
const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'))

let serial = 1
function makeCert(subjectCn: string, issuerCn: string, subjectKey: KeyObject, issuerKey: KeyObject): X509Certificate {
  const tbs = seq(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))), // [0] version v3
    tlv(0x02, Buffer.from([serial++])),
    ECDSA_SHA256,
    name(issuerCn),
    seq(utc(new Date(Date.now() - 86_400_000)), utc(new Date(Date.now() + 365 * 86_400_000))),
    name(subjectCn),
    subjectKey.export({ type: 'spki', format: 'der' }) as Buffer,
  )
  const signature = sign('sha256', tbs, issuerKey) // DER ECDSA-Sig-Value, what X.509 carries
  return new X509Certificate(seq(tbs, ECDSA_SHA256, tlv(0x03, Buffer.concat([Buffer.from([0]), signature]))))
}
const b64 = (c: X509Certificate) => c.raw.toString('base64')
const ec = () => generateKeyPairSync('ec', { namedCurve: 'P-256' })

/** A signedTransactionInfo-shaped JWS signed by `leafKey` with the given x5c chain. */
async function jws(chain: X509Certificate[], leafKey: KeyObject, payload: Record<string, unknown> = { transactionId: '1', productId: 'pro_monthly' }) {
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'ES256', x5c: chain.map(b64) })
    .sign(leafKey)
}

/** The attack: a self-signed CA that CALLS itself Apple Root CA - G3, and a leaf it signed. */
function forgedAppleChain() {
  const root = ec()
  const leaf = ec()
  const rootCert = makeCert('Apple Root CA - G3', 'Apple Root CA - G3', root.publicKey, root.privateKey)
  const leafCert = makeCert('Prod ECC Mac App Store and iTunes Store Receipt Signing', 'Apple Root CA - G3', leaf.publicKey, root.privateKey)
  return { rootCert, leafCert, leafKey: leaf.privateKey }
}

const savedPem = process.env.APPLE_ROOT_CA_PEM
afterEach(() => {
  if (savedPem === undefined) delete process.env.APPLE_ROOT_CA_PEM
  else process.env.APPLE_ROOT_CA_PEM = savedPem
})

describe('Apple JWS — the root is pinned in code (security-audit C2)', () => {
  it('the pinned fingerprint is Apple Root CA - G3 — checked against the real certificate', () => {
    const g3 = new X509Certificate(APPLE_ROOT_CA_G3_PEM)
    expect(g3.subject).toContain('CN=Apple Root CA - G3')
    expect(g3.checkIssued(g3) && g3.verify(g3.publicKey)).toBe(true)
    expect(g3.fingerprint256).toBe(APPLE_ROOT_CA_G3_SHA256)
    expect(trustedRootFingerprints({} as NodeJS.ProcessEnv)).toEqual(new Set([APPLE_ROOT_CA_G3_SHA256]))
  })

  it('REJECTS a self-signed CA named "Apple Root CA - G3" with no env var set — the old fail-open path', async () => {
    delete process.env.APPLE_ROOT_CA_PEM
    const { rootCert, leafCert, leafKey } = forgedAppleChain()
    expect(rootCert.subject).toContain('Apple') // the name the old check trusted
    await expect(verifyTransactionInfo(await jws([leafCert, rootCert], leafKey))).rejects.toThrow(JWSVerificationError)
    await expect(verifyTransactionInfo(await jws([leafCert, rootCert], leafKey))).rejects.toThrow(/not a pinned Apple root/)
  })

  it('still rejects it when APPLE_ROOT_CA_PEM is unreadable — a bad env var cannot loosen the check', async () => {
    process.env.APPLE_ROOT_CA_PEM = 'not a certificate'
    const { rootCert, leafCert, leafKey } = forgedAppleChain()
    await expect(verifyTransactionInfo(await jws([leafCert, rootCert], leafKey))).rejects.toThrow(/not a pinned Apple root/)
  })

  it('APPLE_ROOT_CA_PEM ADDS an anchor: the same chain passes only once its root is configured', async () => {
    // Proves the rest of the path (chain, names, signature) works end to end, and that the pin is
    // the only thing that stopped the forged chain above.
    const { rootCert, leafCert, leafKey } = forgedAppleChain()
    process.env.APPLE_ROOT_CA_PEM = rootCert.toString()
    await expect(verifyTransactionInfo(await jws([leafCert, rootCert], leafKey))).resolves.toMatchObject({ productId: 'pro_monthly' })
  })

  it('rejects a trusted root that is not self-signed', async () => {
    const other = ec()
    const root = ec()
    const leaf = ec()
    const notSelfSigned = makeCert('Apple Root CA - G3', 'Apple Root CA - G3', root.publicKey, other.privateKey)
    const leafCert = makeCert('Leaf', 'Apple Root CA - G3', leaf.publicKey, root.privateKey)
    process.env.APPLE_ROOT_CA_PEM = notSelfSigned.toString()
    await expect(verifyTransactionInfo(await jws([leafCert, notSelfSigned], leaf.privateKey))).rejects.toThrow(/not self-signed/)
  })

  it('rejects a link whose issuer name does not match, even when the key signature verifies', async () => {
    const root = ec()
    const leaf = ec()
    const rootCert = makeCert('Apple Root CA - G3', 'Apple Root CA - G3', root.publicKey, root.privateKey)
    const leafCert = makeCert('Leaf', 'Someone Else Root', leaf.publicKey, root.privateKey)
    process.env.APPLE_ROOT_CA_PEM = rootCert.toString()
    await expect(verifyTransactionInfo(await jws([leafCert, rootCert], leaf.privateKey))).rejects.toThrow(/chain broken/)
  })

  it('rejects a payload signed by a key that is not the leaf certificate', async () => {
    const { rootCert, leafCert } = forgedAppleChain()
    process.env.APPLE_ROOT_CA_PEM = rootCert.toString()
    await expect(verifyTransactionInfo(await jws([leafCert, rootCert], ec().privateKey))).rejects.toThrow(/signature invalid/)
  })
})
