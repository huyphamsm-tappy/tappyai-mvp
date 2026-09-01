// Is this IP address one we are willing to open a connection to?
//
// WHY THIS IS ITS OWN MODULE
// -------------------------
// `isSafeHttpsUrl` answers a question about a *string*: does this URL name something internal?
// That is a useful pre-filter and a useless security boundary, because the string a URL carries
// and the address a socket reaches are two different things. `https://looks-fine.example/` passes
// every hostname check ever written and can still resolve to `10.0.0.5`.
//
// So the real question — the only one that decides whether a packet leaves for the internal
// network — is about an ADDRESS. This module answers exactly that, and nothing else calls DNS or
// opens sockets, so there is one policy rather than one per caller. `isSafeHttpsUrl` delegates its
// IP-literal branch here for the same reason: two copies of a range table drift, and the drift is
// invisible until someone probes it.
//
// Everything not positively known to be public is refused. A parse failure is a refusal.

/** Parse a strict dotted-quad. Returns null for anything else — including `010.1.1.1` and `1.2.3`. */
function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (!m) return null
  const parts = m.slice(1, 5).map(Number)
  if (parts.some(n => n > 255)) return null
  // `01` and `1` are the same number but not the same address to every resolver; refuse the
  // ambiguity rather than pick a winner.
  if (m.slice(1, 5).some(p => p.length > 1 && p.startsWith('0'))) return null
  return parts
}

function isAllowedIPv4(parts: number[]): boolean {
  const [a, b] = parts
  if (a === 0) return false                       // 0.0.0.0/8 — "this network"
  if (a === 10) return false                      // 10/8 private
  if (a === 127) return false                     // 127/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return false  // 100.64/10 CGNAT
  if (a === 169 && b === 254) return false        // 169.254/16 link-local — cloud metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return false   // 172.16/12 private
  if (a === 192 && b === 168) return false        // 192.168/16 private
  if (a >= 224) return false                      // multicast, reserved, broadcast
  return true
}

/**
 * Expand an IPv6 textual address to its 16 bytes, or null if it is not one.
 *
 * Written out rather than pattern-matched on prefixes because prefix matching is where these
 * checks go wrong: `fc`/`fd`/`fe80` as string prefixes miss `0:0:...:1`, miss the hex spelling of
 * an IPv4-mapped address (`::ffff:7f00:1` is 127.0.0.1), and match hostnames that merely start
 * with those letters.
 */
function parseIPv6(input: string): number[] | null {
  let s = input
  const zone = s.indexOf('%')            // scope id — `fe80::1%eth0`
  if (zone !== -1) s = s.slice(0, zone)
  if (!s.includes(':')) return null

  // A trailing dotted-quad (`::ffff:127.0.0.1`) becomes two hex groups.
  let tail: number[] = []
  const lastColon = s.lastIndexOf(':')
  const maybeV4 = s.slice(lastColon + 1)
  if (maybeV4.includes('.')) {
    const v4 = parseIPv4(maybeV4)
    if (!v4) return null
    tail = v4
    s = s.slice(0, lastColon + 1) + '0:0'
  }

  const halves = s.split('::')
  if (halves.length > 2) return null
  const toGroups = (part: string) =>
    part === '' ? [] : part.split(':').map(g => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN))

  let groups: number[]
  if (halves.length === 2) {
    const head = toGroups(halves[0]), rest = toGroups(halves[1])
    const gap = 8 - head.length - rest.length
    if (gap < 0) return null
    groups = [...head, ...Array(gap).fill(0), ...rest]
  } else {
    groups = toGroups(halves[0])
    if (groups.length !== 8) return null
  }
  if (groups.some(Number.isNaN)) return null

  const bytes: number[] = []
  for (const g of groups) { bytes.push((g >> 8) & 0xff, g & 0xff) }
  if (tail.length === 4) { bytes.splice(12, 4, ...tail) }
  return bytes.length === 16 ? bytes : null
}

function isAllowedIPv6(b: number[]): boolean {
  const allZeroThrough = (end: number) => b.slice(0, end).every(x => x === 0)

  if (allZeroThrough(15) && b[15] === 1) return false   // ::1 loopback
  if (allZeroThrough(16)) return false                  // :: unspecified
  if ((b[0] & 0xfe) === 0xfc) return false              // fc00::/7 unique-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return false  // fe80::/10 link-local
  if (b[0] === 0xff) return false                       // ff00::/8 multicast

  // ::ffff:a.b.c.d — an IPv4 address wearing an IPv6 hat. Judge it as the IPv4 address it is,
  // otherwise `::ffff:169.254.169.254` walks straight past every IPv6 rule above.
  if (allZeroThrough(10) && b[10] === 0xff && b[11] === 0xff) {
    return isAllowedIPv4(b.slice(12))
  }
  // 64:ff9b::/96 — NAT64. Same reasoning: the last four bytes are the real destination.
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every(x => x === 0)) {
    return isAllowedIPv4(b.slice(12))
  }
  return true
}

/**
 * THE policy. One address in, one verdict out, no hostnames and no I/O.
 *
 * Anything that does not parse as an address is refused — a caller that cannot say where it is
 * going does not get to go.
 */
export function isAllowedDestinationAddress(address: string): boolean {
  if (typeof address !== 'string') return false
  let s = address.trim().toLowerCase()
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
  if (s === '') return false

  const v4 = parseIPv4(s)
  if (v4) return isAllowedIPv4(v4)

  const v6 = parseIPv6(s)
  if (v6) return isAllowedIPv6(v6)

  return false
}
