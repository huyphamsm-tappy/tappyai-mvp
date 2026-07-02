import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js'

// Resolves the authenticated user for an API route, supporting two client types:
//
// - Web (cookie session): existing @supabase/ssr cookie flow via middleware.ts, unchanged.
// - Native/Android (Authorization: Bearer <supabase-jwt>): the token is verified
//   directly against Supabase Auth (auth.getUser(token)) — a real per-user check,
//   never compared to a shared secret. This is a different mechanism from the
//   internal/cron routes' `Bearer ${CRON_SECRET}` check (src/app/api/cron/*, plus
//   a few debug/broadcast routes) — those authenticate a trusted job, not a user,
//   and are intentionally left untouched by this helper.
//
// The returned `supabase` client is scoped to the resolved identity (via cookies
// for web, via the verified JWT for native) so RLS (`auth.uid()`) keeps working
// identically for both client types — callers don't need to branch on which path
// was used.
export async function getRequestUser(
  req: Request
): Promise<{ user: User | null; supabase: SupabaseClient }> {
  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (bearerToken) {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )
    const { data: { user } } = await supabase.auth.getUser(bearerToken)
    return { user, supabase }
  }

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { user, supabase }
}
