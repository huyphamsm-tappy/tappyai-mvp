import Foundation
import Supabase

/// Reads the onboarding flag for the current user — a direct RLS-bound Supabase read (delegated to
/// the client per docs/ios/14 §4). The onboarding *requirement* is still enforced server-side; this
/// only decides which screen to route to after auth (survey §1.7).
///
/// NOTE (unverified): confirm on a Mac whether a Supabase trigger auto-creates `profiles` on signup
/// (survey open item D3). A missing row is treated as "not onboarded".
struct ProfileGateService: Sendable {
    let supabase: SupabaseClient

    private struct Row: Decodable { let onboarded: Bool? }

    func isOnboarded(userId: String) async -> Bool {
        do {
            let row: Row = try await supabase
                .from("profiles")
                .select("onboarded")
                .eq("id", value: userId)
                .single()
                .execute()
                .value
            return row.onboarded ?? false
        } catch {
            AppLogger.auth.info("profiles.onboarded read failed/absent → treat as not onboarded")
            return false
        }
    }
}
