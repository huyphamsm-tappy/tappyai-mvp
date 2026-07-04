// SSRF guard for user-supplied external URLs.
// Allows ONLY https:// URLs pointing at public hosts. Rejects every other
// scheme (http, file, ftp, data, gopher, …), embedded credentials, and any
// hostname that is / resolves to a loopback, private, link-local, CGNAT, or
// internal-TLD address. Hostname/IP-literal filtering does not stop DNS
// rebinding (a public name resolving to a private IP); callers that fetch the
// URL server-side should additionally avoid following redirects.
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

  // IPv4 literal → block loopback / private / link-local / CGNAT / reserved.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (a === 0 || a === 10 || a === 127) return false
    if (a === 169 && b === 254) return false          // link-local (169.254/16)
    if (a === 172 && b >= 16 && b <= 31) return false // private (172.16/12)
    if (a === 192 && b === 168) return false          // private (192.168/16)
    if (a === 100 && b >= 64 && b <= 127) return false // CGNAT (100.64/10)
    if (a >= 224) return false                        // multicast / reserved
    return true
  }

  // IPv6 loopback / unique-local / link-local.
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return false
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:')) return false

  return true
}
