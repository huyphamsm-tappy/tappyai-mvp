import Foundation
import Supabase

/// Infrastructure (Phase 0 refinement 2): constructs the shared `SupabaseClient` from environment
/// configuration and hands it to DI. The client EXISTS but is deliberately UNUSED in Phase 0 —
/// no authentication, no queries, no repositories. Auth and data access are wired in later phases
/// through the Thin Client boundary (docs/ios/14): direct RLS-bound reads via this client, and all
/// privileged logic via the Next.js `APIClient`.
enum SupabaseClientProvider {
    static func make(_ env: AppEnvironment) -> SupabaseClient {
        SupabaseClient(supabaseURL: env.supabaseURL, supabaseKey: env.supabaseAnonKey)
    }
}
