// Server-side HTTP for URLs a stranger chose, with the destination address pinned.
//
// ============================================================================
// THE PROBLEM THIS SOLVES
// ============================================================================
// Refusing `http://10.0.0.5/` by inspecting the string is easy and stops nothing, because an
// attacker does not have to write the address down. `https://looks-fine.example/` is a perfectly
// ordinary URL that any hostname filter waves through, and its owner decides what it resolves to.
// Point the A record at `169.254.169.254` and the server fetches cloud metadata on their behalf.
//
// The classic hardening — resolve, check the answer, then fetch — does not close it either. That
// is two resolutions with a gap in between, and the attacker controls the DNS TTL: answer
// publicly for the check, privately for the connection. DNS rebinding lives in that gap.
//
// ============================================================================
// THE INVARIANT
// ============================================================================
// 🔑 There is exactly ONE resolution, and the socket connects to ITS result:
//
//     VALIDATED ADDRESS  ==  CONNECTED ADDRESS
//
// Node lets us hold that guarantee by accepting a custom `lookup` on the request. The socket layer
// calls it, and connects to whatever it returns — so validating inside the lookup and refusing
// there means the connection is never attempted, not merely reported afterwards. There is no
// second resolution to poison because nothing resolves the name again.
//
// Measured, not assumed (`__tests__/dnsPinning.test.ts` re-measures it on every run):
//   · a custom lookup is called, once, and the socket goes where it says
//   · an error from the lookup ⇒ ZERO connections observed at the destination
//   · TLS still verifies the certificate against the HOSTNAME, so pinning does not become MITM
//
// 🚨 `agent: false` is load-bearing. Node 19+ enables keepAlive on the global agent, and a pooled
// socket is reused WITHOUT calling `lookup` at all. A pooled connection already points at a
// validated address so it is not itself a hole, but it makes the guarantee untestable and depends
// on pool internals for its safety. One connection per request keeps the property observable.

import https from 'node:https'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { isAllowedDestinationAddress } from './addressPolicy'

/**
 * Thrown when a destination resolves somewhere we will not go.
 *
 * 🚨 The message deliberately says nothing about WHICH address came back. Callers fold provider
 * errors into the evidence report that goes to the client, so a message naming `10.0.0.5` would
 * turn the SSRF fix into an internal-topology oracle — the attacker probes names and reads our
 * error text for the answer.
 */
export class BlockedDestinationError extends Error {
  constructor() {
    super('Destination is not allowed')
    this.name = 'BlockedDestinationError'
  }
}

type ResolveAll = (
  hostname: string,
  options: { all: true; verbatim: true },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void

/**
 * Build the pinning resolver. Injectable so tests can drive the DNS answer without a real zone.
 *
 * 🔑 It asks for ALL addresses and refuses if ANY of them is disallowed — not "if the one we
 * happened to pick" is. A name with two A records, one public and one private, is a name the
 * attacker only has to get lucky with once; and a resolver is free to return them in any order.
 */
export function createSafeLookup(resolveAll: ResolveAll) {
  return function safeLookupImpl(
    hostname: string,
    options: unknown,
    callback: (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void,
  ): void {
    resolveAll(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err)
      if (!addresses || addresses.length === 0) {
        return callback(Object.assign(new Error('No address'), { code: 'ENOTFOUND' }))
      }
      for (const a of addresses) {
        if (!isAllowedDestinationAddress(a.address)) {
          return callback(Object.assign(new BlockedDestinationError(), { code: 'ENOTFOUND' }))
        }
      }
      // `all: true` and `all: false` are different callback shapes; the socket layer picks.
      const wantsAll = typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true
      if (wantsAll) return callback(null, addresses)
      return callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

/** The production resolver, backed by the system resolver. */
export const safeLookup = createSafeLookup(dnsLookup as unknown as ResolveAll)

export interface SafeHeadResponse {
  status: number
  location: string | null
}

/**
 * One HEAD request to a URL a stranger chose.
 *
 * Redirects are NOT followed — the caller inspects `location` and decides, because deciding is
 * the whole job: each hop has to clear the policy before it is fetched. An HTTP client that
 * follows redirects itself would make that impossible.
 */
export function safeHeadRequest(rawUrl: string, signal: AbortSignal): Promise<SafeHeadResponse> {
  return new Promise((resolve, reject) => {
    let url: URL
    try { url = new URL(rawUrl) } catch { return reject(new BlockedDestinationError()) }
    if (url.protocol !== 'https:') return reject(new BlockedDestinationError())

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'HEAD',
        headers: { 'User-Agent': 'TappyAI-ScamShield/1.0', Host: url.host },
        servername: url.hostname,   // SNI + certificate identity stay tied to the NAME
        lookup: safeLookup,
        agent: false,
        signal,
      },
      res => {
        res.resume()   // HEAD has no body, but an undrained response keeps the socket alive
        resolve({
          status: res.statusCode ?? 0,
          location: (res.headers.location as string | undefined) ?? null,
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}
