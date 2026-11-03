import { createAdminClient } from '@/lib/supabase/admin'

// Tappy Business — the one place the data layer obtains a database client.
//
// Every Business table grants privileges to `service_role` alone, so each
// repository needs the admin client. Constructing it in each file would spread
// the service-role surface across the directory and leave tests to intercept an
// import they do not own.
//
// The seam follows `src/lib/security/distributedRateLimit.ts`: a module-level
// override that tests set and reset, never a mock of the import graph. What is
// substituted is the STORE, never the repository under test — a mocked
// repository proves the mock.

type AdminClient = ReturnType<typeof createAdminClient>

let override: AdminClient | null = null

/** The client every repository in this directory uses. */
export function businessDb(): AdminClient {
  return override ?? createAdminClient()
}

/** Test seam. Production never calls this. */
export function __setBusinessDb(next: AdminClient | null): void {
  override = next
}

/** Test seam. Restores the real client. */
export function __resetBusinessDb(): void {
  override = null
}
