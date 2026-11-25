import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Reads ONE OAuth client's registration (its redirect URIs) through Supabase's Auth admin API, so the connector can tell which AI Host a dynamically registered client is.
// It uses the project's one sanctioned admin client (src/lib/supabase/admin.ts) and only READS one registration record: no user, no token, no data. Anything that goes wrong is null
// (the client is then simply not approved). The client id is checked to be a UUID before it reaches the SDK.
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createSupabaseClientLookup(env: Record<string, string | undefined> = process.env): ((clientId: string) => Promise<{ redirect_uris?: unknown } | null>) | null {
  // The admin credential itself is the admin module's business (a missing one makes the SDK call fail, which is "not approved"); here only the project URL is checked.
  if (!env.NEXT_PUBLIC_SUPABASE_URL) return null
  return async clientId => {
    if (!CLIENT_ID.test(clientId)) return null
    const { data, error } = await createAdminClient().auth.admin.oauth.getClient(clientId)
    return error || !data ? null : { redirect_uris: (data as { redirect_uris?: unknown }).redirect_uris }
  }
}
