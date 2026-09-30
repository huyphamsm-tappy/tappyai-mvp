import Foundation

/// Backend-owned product configuration from `GET /api/config` (docs/ios/04 §2.13).
/// Display values only — enforcement stays server-side. Cached per ADR-007 (presentation data).
///
/// 🚨 A FIELD NO SCREEN NEEDS MUST NEVER FAIL THE WHOLE CONFIG. TestFlight build 50 (30/09): the app
/// required `freemium.anonLifetimeLimit`, production (f42ae4b) still sends the old
/// `freemium.anonDailyLimit`, so the entire `/api/config` decode threw and login/onboarding showed
/// "Không tải được cấu hình" for every user. No screen reads the freemium numbers from here
/// (`EntitlementService` has its own source), so the section is optional, its fields optional, and a
/// section that does not decode becomes nil instead of taking the rest down with it.
struct AppConfig: Decodable, Sendable {
    let freemium: Freemium?
    let flags: Flags
    let upload: Upload
    let auth: Auth?
    let onboarding: Onboarding?
    let video: Video?

    struct Video: Decodable, Sendable {
        /// The platforms a user may import a video from — web `LINK_VIDEO_PROVIDERS`. Optional so
        /// an older deployment that predates the field still decodes.
        let linkProviders: [String]?
    }

    struct Freemium: Decodable, Sendable {
        /// Registered account: AI questions per VN day (one pool shared by every AI feature).
        let freeDailyLimit: Int?
        /// Anonymous identity: AI questions for its LIFETIME — one trial, once. NOT per day.
        /// Renamed from `anonDailyLimit` (2026-09-15) so no screen can present it as a daily figure.
        /// Nil against a server that still sends the old name (production f42ae4b).
        let anonLifetimeLimit: Int?
    }

    private enum CodingKeys: String, CodingKey { case freemium, flags, upload, auth, onboarding, video }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // Required: every screen that reads config reads these two.
        flags = try c.decode(Flags.self, forKey: .flags)
        upload = try c.decode(Upload.self, forKey: .upload)
        // Everything else: a section that is absent OR malformed is nil, never a failed config.
        freemium = try? c.decodeIfPresent(Freemium.self, forKey: .freemium)
        auth = try? c.decodeIfPresent(Auth.self, forKey: .auth)
        onboarding = try? c.decodeIfPresent(Onboarding.self, forKey: .onboarding)
        video = try? c.decodeIfPresent(Video.self, forKey: .video)
    }

    struct Flags: Decodable, Sendable {
        let showProUpgrade: Bool
        /// App Connections (integrations) UI entry-point gate — mirrors Web
        /// `SHOW_APP_CONNECTIONS`. Optional so decoding still succeeds against an
        /// older /api/config that predates the flag; absent is treated as hidden.
        let showAppConnections: Bool?
        /// Music UI entry-point gate — mirrors Web `SHOW_MUSIC`. Optional so decoding still
        /// succeeds against an older /api/config that predates the flag. The screens read the
        /// compile-time `ProductFlags.showMusic`, which must carry the same value: a surface
        /// withdrawn for a legal reason cannot wait for the first config response to disappear.
        let showMusic: Bool?
        /// In-app self-deletion (`POST /api/account/delete`) — mirrors Web
        /// `ACCOUNT_SELF_DELETE_ENABLED` (`flags.accountSelfDelete`). Absent (older /api/config,
        /// production today) is treated as off: the app keeps the email request instead.
        let accountSelfDelete: Bool?
        /// Sign in with Apple. No server sends it yet (neither rc/web-uat nor main); absent = the
        /// button stays hidden. See `AppleSignIn.isEnabled`.
        let appleSignIn: Bool?
    }

    struct Upload: Decodable, Sendable {
        let maxPhotosPerReview: Int
        let maxVideoSizeMb: Int
        let maxVideoDurationSec: Int
        /// Validation ceiling (300s advertised + 5s tolerance). Optional so an older deployment
        /// that does not send it still decodes; `UploadLimits` carries the same default.
        let maxVideoDurationAcceptSec: Int?
        /// Per-photo ceiling in binary megabytes (Web `MAX_PHOTO_SIZE_MB`). Optional so an older
        /// deployment that does not send it still decodes; `UploadLimits` carries the same default.
        let maxPhotoSizeMb: Int?
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
            /// What production actually sends: a web i18n key (`tag.food`) and an emoji, no labels.
            let key: String?
            let emoji: String?

            /// labelVi/labelEn when sent, else the key looked up in the app catalog (`tag.food` →
            /// "Ăn uống"), else the id — never an empty chip.
            func label(locale: String, localize: (String) -> String = { NSLocalizedString($0, comment: "") }) -> String {
                if let l = (locale == "vi" ? labelVi : labelEn), !l.isEmpty { return l }
                if let key {
                    let text = localize(key)
                    if text != key { return [emoji, text].compactMap { $0 }.joined(separator: " ") }
                }
                return id
            }
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

    /// The platforms the backend accepts a video link from (`video.linkProviders`).
    ///
    /// Falls back to the V1 contract rather than an empty list: "no provider" would disable the
    /// composer's Link tab outright, whereas the backend's actual V1 answer is YouTube.
    func supportedLinkProviders() async throws -> [String] {
        let providers = try await config().video?.linkProviders ?? []
        return providers.isEmpty ? ["youtube"] : providers
    }

    func onboardingInterests(locale: String) async throws -> [(id: String, label: String)] {
        let cfg = try await config()
        guard let interests = cfg.onboarding?.interests, !interests.isEmpty else { return [] }
        return interests.map { i in (id: i.id, label: i.label(locale: locale)) }
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
