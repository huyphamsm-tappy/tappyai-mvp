import Foundation

/// Backend-owned product configuration from `GET /api/config` (docs/ios/04 §2.13).
/// Display values only — enforcement stays server-side. Cached per ADR-007 (presentation data).
struct AppConfig: Decodable, Sendable {
    let freemium: Freemium
    let flags: Flags
    let upload: Upload
    let auth: Auth?
    let onboarding: Onboarding?

    struct Freemium: Decodable, Sendable {
        let freeDailyLimit: Int
        let anonDailyLimit: Int
    }

    struct Flags: Decodable, Sendable {
        let showProUpgrade: Bool
        /// App Connections (integrations) UI entry-point gate — mirrors Web
        /// `SHOW_APP_CONNECTIONS`. Optional so decoding still succeeds against an
        /// older /api/config that predates the flag; absent is treated as hidden.
        let showAppConnections: Bool?
    }

    struct Upload: Decodable, Sendable {
        let maxPhotosPerReview: Int
        let maxVideoSizeMb: Int
        let maxVideoDurationSec: Int
    }

    struct Auth: Decodable, Sendable {
        let providers: [Provider]

        struct Provider: Decodable, Sendable {
            let id: String
            let enabled: Bool
        }
    }

    struct Onboarding: Decodable, Sendable {
        let interests: [Interest]?
        let cities: [String]?

        struct Interest: Decodable, Sendable {
            let id: String
            let labelVi: String?
            let labelEn: String?
        }
    }
}

/// Fetches and caches backend config. No hardcoded fallbacks — the backend is the single source of
/// truth. Cache TTL is derived from the response's `Cache-Control: max-age=N` header; responses
/// without a max-age directive are not cached.
final class AppConfigService: Sendable {
    private let api: APIClient
    private let cache: CacheStore
    private let decoder: JSONDecoder
    private static let cacheKey = "app_config"

    init(api: APIClient, cache: CacheStore = CacheStore()) {
        self.api = api
        self.cache = cache
        self.decoder = ResponseDecoder.json
    }

    func config() async throws -> AppConfig {
        if let cached: AppConfig = cache.value(for: Self.cacheKey) { return cached }
        let endpoint = Endpoint(path: "/api/config", method: .get, requiresAuth: false)
        let response = try await api.sendWithResponse(endpoint)
        let cfg = try decoder.decode(AppConfig.self, from: response.data)
        if let ttl = Self.maxAge(from: response.headers) {
            cache.set(cfg, for: Self.cacheKey, ttl: ttl)
        }
        return cfg
    }

    func enabledProviders() async throws -> [String] {
        let cfg = try await config()
        guard let auth = cfg.auth else { return [] }
        return auth.providers.filter(\.enabled).map(\.id)
    }

    func onboardingInterests(locale: String) async throws -> [(id: String, label: String)] {
        let cfg = try await config()
        guard let interests = cfg.onboarding?.interests, !interests.isEmpty else { return [] }
        return interests.map { i in
            let label = (locale == "vi" ? i.labelVi : i.labelEn) ?? i.id
            return (id: i.id, label: label)
        }
    }

    func onboardingCities() async throws -> [String] {
        let cfg = try await config()
        return cfg.onboarding?.cities ?? []
    }

    private static func maxAge(from headers: [String: String]) -> TimeInterval? {
        guard let cc = headers["cache-control"] else { return nil }
        for directive in cc.split(separator: ",") {
            let trimmed = directive.trimmingCharacters(in: .whitespaces).lowercased()
            if trimmed.hasPrefix("max-age="), let seconds = TimeInterval(trimmed.dropFirst(8)) {
                return max(seconds, 0)
            }
        }
        return nil
    }
}
