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
            // 03/11: an array read, not `.single()`: "no profile row yet" (a new account) must be told apart from "the read failed".
            let rows: [Row] = try await supabase
                .from("profiles")
                .select("onboarded")
                .eq("id", value: userId)
                .limit(1)
                .execute()
                .value
            guard let row = rows.first else { return false }   // no row: a new account, onboarding is next
            return row.onboarded ?? false
        } catch {
            // The read FAILED (offline, a timeout, a server hiccup). That says nothing about this person: before, it sent a signed-in
            // user back to the full-screen onboarding with no way out. The server still enforces what onboarding gates.
            AppLogger.auth.info("profiles.onboarded read failed → keep the person where they are, not onboarding")
            return true
        }
    }
}
