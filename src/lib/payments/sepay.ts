// PAYMENTS — SePay / VietQR helpers (docs/phase8/PAYMENTS.md §2.5). Pure functions + env reads.
//
// SePay webhook contract (docs.sepay.vn/tich-hop-webhooks.html, checked 2026-09-27):
//   POST JSON { id, gateway, transactionDate, accountNumber, subAccount, code, content,
//               transferType: 'in'|'out', transferAmount, accumulated, referenceCode, description }
//   Auth "API Key": header `Authorization: Apikey <key>`.
//   Auth "HMAC-SHA256" (DEFAULT since 2026-10-01, Huy; developer.sepay.vn/en/sepay-webhooks/xac-thuc):
//     X-SePay-Timestamp: <unix seconds>, X-SePay-Signature: sha256=<hex HMAC-SHA256(secret,
//     "<timestamp>.<RAW body>")>. Reject a timestamp more than 5 minutes off. The RAW bytes are signed
//     - never re-serialise the parsed JSON.
//   Success = HTTP 200/201 with {"success": true} within 30 s; otherwise retried (≤ 7 times / 5 h).
// `code` is only filled when the payment-code format is configured in SePay
// (prefix TAPPY, 6 characters) — otherwise we fall back to the transfer content.

import { clientIp } from '@/lib/security/rateLimit'
import { createHmac, timingSafeEqual } from 'node:crypto'

/** TAPPY + 6 of A–Z/2–9 without the look-alikes 0 O 1 I. Must match the DB CHECK. */
export const ORDER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_RE = /TAPPY[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}/i

export const ORDER_TTL_SECONDS = 15 * 60
export const MAX_PENDING_ORDERS = 3

export interface SepayBankConfig {
  accountNumber: string
  bankCode: string
  accountName: string
}

/** The receiving account, or null when any part is missing (then web payment is unavailable). */
export function sepayBankConfig(env: NodeJS.ProcessEnv = process.env): SepayBankConfig | null {
  const accountNumber = env.SEPAY_BANK_ACCOUNT?.trim()
  const bankCode = env.SEPAY_BANK_CODE?.trim()
  const accountName = env.SEPAY_ACCOUNT_NAME?.trim()
  if (!accountNumber || !bankCode || !accountName) return null
  return { accountNumber, bankCode, accountName }
}

/** SePay's QR image service: a VietQR with account, bank, amount and content filled in. */
export function sepayQrUrl(bank: SepayBankConfig, amountVnd: number, code: string): string {
  const q = new URLSearchParams({ acc: bank.accountNumber, bank: bank.bankCode, amount: String(amountVnd), des: code })
  return `https://qr.sepay.vn/img?${q.toString()}`
}

/** Order code from the webhook: the `code` field first, then a case-insensitive search of the content. */
export function extractOrderCode(body: { code?: unknown; content?: unknown; description?: unknown }): string | null {
  for (const v of [body.code, body.content, body.description]) {
    if (typeof v !== 'string') continue
    const m = v.match(CODE_RE)
    if (m) return m[0].toUpperCase()
  }
  return null
}

/** Constant-time check of `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`. False when the key is unset. */
export function sepayAuthorized(header: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const key = env.SEPAY_WEBHOOK_API_KEY?.trim()
  if (!key || !header) return false
  return constantTimeEqual(header.trim(), `Apikey ${key}`)
}

/** Which webhook authentication is accepted: HMAC (default) or the API-key fallback. Never both. */
export type SepayAuthMode = 'hmac' | 'apikey'
export function sepayAuthMode(env: NodeJS.ProcessEnv = process.env): SepayAuthMode {
  return env.SEPAY_WEBHOOK_AUTH_MODE?.trim().toLowerCase() === 'apikey' ? 'apikey' : 'hmac'
}

export const SEPAY_SIGNATURE_MAX_SKEW_SECONDS = 300

/** The signature SePay sends for `rawBody` at `timestamp` (also used by the test-only fake bank). */
export function sepaySignature(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')}`
}

export type SepaySignatureCheck = 'ok' | 'no_secret' | 'missing' | 'stale' | 'bad_signature'

/**
 * HMAC check over the RAW body. Fails closed: no secret configured, a missing header, a timestamp more
 * than 5 minutes from now (either way), or a signature that differs in any byte -> not 'ok'.
 */
export function checkSepaySignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
): SepaySignatureCheck {
  const secret = env.SEPAY_WEBHOOK_HMAC_SECRET?.trim()
  if (!secret) return 'no_secret'
  if (!signature || !timestamp || !/^\d{1,12}$/.test(timestamp.trim())) return 'missing'
  if (Math.abs(nowMs / 1000 - Number(timestamp.trim())) > SEPAY_SIGNATURE_MAX_SKEW_SECONDS) return 'stale'
  return constantTimeEqual(signature.trim().toLowerCase(), sepaySignature(secret, timestamp.trim(), rawBody)) ? 'ok' : 'bad_signature'
}

/** SePay's published webhook source addresses (docs.sepay.vn/tich-hop-webhooks.html, read 2026-10-01). */
export const SEPAY_WEBHOOK_IPS: readonly string[] = [
  '172.236.138.20', '172.233.83.68', '171.244.35.2', '151.158.108.68', '151.158.109.79', '103.255.238.139', '45.57.137.67',
  '2400:8905::2000:8cff:fe98:45cd', '2600:3c15::2000:8aff:fedd:874b',
]

/**
 * Optional source-IP allowlist, OFF unless `SEPAY_WEBHOOK_IP_ALLOWLIST` is set: `sepay` = the published
 * list above, or a comma-separated list. The address is the platform's (`x-vercel-forwarded-for`, then
 * `x-real-ip`) - never the client-controlled left end of X-Forwarded-For. Unknown address -> refused.
 */
export function sepaySourceAllowed(headers: Headers, env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = env.SEPAY_WEBHOOK_IP_ALLOWLIST?.trim()
  if (!cfg) return true
  const list = cfg.toLowerCase() === 'sepay' ? SEPAY_WEBHOOK_IPS : cfg.split(',').map((x) => x.trim()).filter(Boolean)
  const ip = clientIp({ headers }).toLowerCase()
  return ip !== 'unknown' && list.some((a) => a.toLowerCase() === ip)
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  // Compare equal-length buffers so the length check itself leaks nothing beyond "different".
  const len = Math.max(ab.length, bb.length, 1)
  const pa = Buffer.alloc(len); ab.copy(pa)
  const pb = Buffer.alloc(len); bb.copy(pb)
  return timingSafeEqual(pa, pb) && ab.length === bb.length
}

export interface SepayTransaction {
  id: number
  transferType: string
  transferAmount: number
  accountNumber: string | null
  code: string | null
  gateway: string | null
  transactionDate: string | null
  referenceCode: string | null
}

/** Validates the webhook body. Null = not a SePay transaction we can record. */
export function parseSepayTransaction(body: unknown): SepayTransaction | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const id = typeof b.id === 'number' ? b.id : typeof b.id === 'string' && /^\d+$/.test(b.id) ? Number(b.id) : NaN
  const amount = typeof b.transferAmount === 'number' ? b.transferAmount : Number(b.transferAmount)
  if (!Number.isSafeInteger(id) || id <= 0) return null
  if (!Number.isFinite(amount) || amount < 0) return null
  if (typeof b.transferType !== 'string') return null
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v.slice(0, 200) : null)
  return {
    id,
    transferType: b.transferType,
    transferAmount: Math.round(amount),
    accountNumber: str(b.accountNumber),
    code: extractOrderCode(b),
    gateway: str(b.gateway),
    transactionDate: str(b.transactionDate),
    referenceCode: str(b.referenceCode),
  }
}

/**
 * The transfer type the database decides on. Only an incoming transfer to OUR configured account
 * can pay an order; anything else is recorded as `other_account` (P8-17: this used to fail open
 * when the account number was missing on either side).
 */
export function sepayTransferType(tx: Pick<SepayTransaction, 'transferType' | 'accountNumber'>, ourAccount: string | null): string {
  if (tx.transferType !== 'in') return tx.transferType
  if (!ourAccount || !tx.accountNumber || tx.accountNumber.trim() !== ourAccount) return 'other_account'
  return 'in'
}
