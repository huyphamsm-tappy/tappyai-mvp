// security-audit L2 — a build-time guard, not a comment: Next.js (14.2 webpack-config, "Detect
// server-only / client-only imports") fails the build if this module is reached from a client
// bundle. The key it reads is not NEXT_PUBLIC_, so it would be undefined in a browser anyway — the
// point is that a client import of the service-role client is caught at build, not in production.
import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Server-only; never import in client components.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
