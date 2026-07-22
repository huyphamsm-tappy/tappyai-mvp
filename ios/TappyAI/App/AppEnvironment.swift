import Foundation

/// Read-only, non-secret runtime configuration sourced from the build settings
/// (`Config/*.xcconfig` → Info.plist). No secrets are hardcoded; values are injected per configuration.
struct AppEnvironment: Sendable {
    enum Kind: String, Sendable { case debug, release }

    let kind: Kind
    let apiBaseURL: URL
    let supabaseURL: URL
    let supabaseAnonKey: String

    var isDebug: Bool { kind == .debug }

    static let current: AppEnvironment = .load()

    private static func load() -> AppEnvironment {
        let info = Bundle.main.infoDictionary ?? [:]
        func string(_ key: String) -> String {
            (info[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
        let kind = Kind(rawValue: string("TAPPY_ENV")) ?? .release
#if DEBUG
        if string("TAPPY_API_BASE_URL").isEmpty {
            preconditionFailure("TAPPY_API_BASE_URL missing — check Config/Debug.xcconfig and that the xcconfig is assigned to your scheme")
        }
        if string("SUPABASE_URL").isEmpty {
            preconditionFailure("SUPABASE_URL missing — check Config/Debug.xcconfig")
        }
        if string("SUPABASE_ANON_KEY").isEmpty {
            preconditionFailure("SUPABASE_ANON_KEY missing — check Config/Debug.xcconfig")
        }
#endif
        let api = URL(string: string("TAPPY_API_BASE_URL")) ?? URL(string: "https://www.tappyai.com")!
        let supabase = URL(string: string("SUPABASE_URL")) ?? URL(string: "https://localhost")!
        return AppEnvironment(
            kind: kind,
            apiBaseURL: api,
            supabaseURL: supabase,
            supabaseAnonKey: string("SUPABASE_ANON_KEY")
        )
    }
}
