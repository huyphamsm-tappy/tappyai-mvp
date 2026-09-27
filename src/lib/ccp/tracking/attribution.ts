import { createHmac } from 'node:crypto'

// ── Affiliate attribution id (sub1) — pseudonymous, keyed, never reversible ──
//
// The affiliate network receives ONE attribution value per click (`sub1` on the ACCESSTRADE Deep
// Link) so a conversion can be tied back to a Tappy identity without the network ever holding
// anything about the person. The value is an HMAC of the VERIFIED identity id the chat route
// already holds (a signed-in account or a Supabase anonymous session — both are opaque UUIDs),
// keyed by `CCP_ATTRIBUTION_SECRET`:
//   · never an e-mail, name, phone or the raw id (Plan §13; the request schema only admits hex);
//   · the network cannot reverse it (keyed) and cannot correlate it with any other Tappy surface
//     (domain-separated with the `ccp-sub1:` prefix);
//   · only Tappy, holding the secret, can recompute it for a given id when reconciling a
//     conversion report.
// No secret configured ⇒ no attribution id (the link is still tracked by the network; it is just
// not attributable to a Tappy identity). Fail closed on privacy, never on the click.
//
// Read HERE and nowhere else, like every other affiliate credential (architecture rule
// no-affiliate-keys-outside-ccp-tracking).

const ID_SHAPE = /^[A-Za-z0-9-]{8,128}$/

/** 24 lowercase hex chars (96 bits) — fits the CCP request schema and every network's sub-id field. */
export function commerceActorHash(identityId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = env.CCP_ATTRIBUTION_SECRET?.trim()
  if (!secret || secret.length < 32) return undefined
  if (!identityId || !ID_SHAPE.test(identityId)) return undefined
  return createHmac('sha256', secret).update(`ccp-sub1:${identityId}`).digest('hex').slice(0, 24)
}
