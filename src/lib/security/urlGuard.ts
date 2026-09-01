// SSRF guard for user-supplied external URLs.
// Allows ONLY https:// URLs pointing at public hosts. Rejects every other
// scheme (http, file, ftp, data, gopher, …), embedded credentials, and any
// hostname that IS a loopback, private, link-local, CGNAT, or internal-TLD
// address.
//
// 🚨 SCOPE — this is a check on a STRING, and a string is not a destination.
// It cannot see that `https://looks-fine.example/` resolves to `10.0.0.5`, so
// it is a cheap pre-filter and NOT the SSRF boundary. Anything that actually
// opens a socket to a user-supplied URL must go through `safeFetch`, which
// pins the connection to an address it validated. See `addressPolicy.ts`.
//
// The IP-literal branch below delegates to that same policy so the two cannot
// drift: a range fixed in one table and forgotten in the other is exactly the
// kind of gap that stays invisible until someone probes it.
import { isAllowedDestinationAddress } from './addressPolicy'

export function isSafeHttpsUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  if (u.username || u.password) return false

  let h = u.hostname.toLowerCase()
  // Normalise a bracketed IPv6 literal.
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)

  // Internal name suffixes.
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return false
  }

  // An IP literal is already a destination, so ask the destination policy rather than keeping a
  // second copy of the range table here. It also parses forms the old inline check missed —
  // `0:0:0:0:0:ffff:7f00:1` is 127.0.0.1 spelled in hex, and no string prefix catches it.
  const looksLikeAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')
  if (looksLikeAddress) return isAllowedDestinationAddress(h)

  return true
}
