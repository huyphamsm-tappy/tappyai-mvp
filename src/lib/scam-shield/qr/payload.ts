// What a scanned QR code CONTAINS, decided on the device from the decoded text alone (owner 02/10: the QR image never leaves the
// phone / the browser; only a decoded http(s) link goes on to the link check). Pure and synchronous: no network, no I/O.

export type QrKind = 'url' | 'payment' | 'wifi' | 'contact' | 'phone' | 'sms' | 'email' | 'geo' | 'app_link' | 'text'

export interface QrPayload {
  kind: QrKind
  /** Present for kind 'url': the link to hand to the link check (bare domains get https://). */
  url?: string
}

const PAYMENT_SCHEMES = /^(momo|zalopay|vnpay|vietqr|viettelpay|shopeepay|upi|bitcoin|ethereum|paypal|alipays?|weixin)\b/i
const BARE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/:?#]\S*)?$/i

export function classifyQrPayload(raw: string): QrPayload {
  const text = (raw ?? '').trim()
  if (!text) return { kind: 'text' }
  if (/^https?:\/\//i.test(text)) {
    try { return { kind: 'url', url: new URL(text).toString() } } catch { return { kind: 'text' } }
  }
  // EMVCo merchant-presented payment QR (VietQR, bank apps): starts with the payload format indicator 000201.
  if (/^000201\d{2}/.test(text)) return { kind: 'payment' }
  if (/^WIFI:/i.test(text)) return { kind: 'wifi' }
  if (/^(BEGIN:VCARD|MECARD:|BIZCARD:)/i.test(text)) return { kind: 'contact' }
  if (/^tel:/i.test(text)) return { kind: 'phone' }
  if (/^(smsto?|mms|mmsto):/i.test(text)) return { kind: 'sms' }
  if (/^(mailto:|MATMSG:)/i.test(text)) return { kind: 'email' }
  if (/^geo:/i.test(text)) return { kind: 'geo' }
  if (PAYMENT_SCHEMES.test(text)) return { kind: 'payment' }
  // any other scheme (intent:, market:, a custom app link…): never opened from here
  if (/^[a-z][a-z0-9+.-]{1,30}:/i.test(text)) return { kind: 'app_link' }
  if (BARE_HOST.test(text)) {
    try { return { kind: 'url', url: new URL(`https://${text}`).toString() } } catch { /* fall through */ }
  }
  return { kind: 'text' }
}
