/**
 * A fresh uuid for one send attempt (the `clientId` the send route stores to make a retry idempotent).
 *
 * It is an idempotency key, not a secret: the database keys it with (thread, sender), so two people can never collide with each other.
 * `crypto.randomUUID` where the browser has it; otherwise a v4 built from `getRandomValues`, and from `Math.random` as the last resort.
 */
export function newClientId(): string {
  const c = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variant
  const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
