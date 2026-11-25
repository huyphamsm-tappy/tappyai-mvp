// A token issued by the Supabase OAuth server to a THIRD-PARTY app (an AI Host through the MCP connector) is a normal Supabase user JWT with two extra claims: `client_id` and `scope`.
// Seen on a real token 22/11/2026: aud = "authenticated", scope = "openid profile". Nothing in it limits it to the connector, so without this check such a token would be accepted by
// every Tappy API route as the signed-in person (chat, profile, groups, messages...). Routes call getRequestUser, which refuses these tokens; only the MCP gateway (its own verifier) accepts them.
// A web or native session token has no `client_id`. Pure; it reads a claim and verifies nothing: the identity provider still decides whether a token is alive.
export function isOAuthClientToken(token: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown
    return !!p && typeof p === 'object' && !Array.isArray(p) && typeof (p as { client_id?: unknown }).client_id === 'string' && (p as { client_id: string }).client_id.length > 0
  } catch { return false }
}
