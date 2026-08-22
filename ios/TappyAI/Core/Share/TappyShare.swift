import Foundation

/// The share targets, mirroring the web contract in `src/lib/share/shareTargets.ts`
/// and the Android one in `TappyShare.kt`.
///
/// iOS already had `UIActivityViewController` / `ShareLink`, which is the right
/// primitive but not the whole experience: the system sheet shows whatever is
/// installed and gives the user no explicit Facebook / TikTok / Zalo choice.
/// These targets sit on top; the system sheet remains "More apps".
///
/// URL handoff only. TappyAI does not publish to any of these networks, so
/// nothing here may report that a post was made.
enum TappyShare {

    /// Canonical public origin. Must match NEXT_PUBLIC_SITE_URL on the web.
    static let canonicalOrigin = "https://www.tappyai.com"

    enum Target: String, CaseIterable {
        case facebook
        case tiktok
        case zalo
        case copy
        case native
    }

    /// Display order, identical to web and Android.
    static let targets: [Target] = [.facebook, .tiktok, .zalo, .copy, .native]

    private static let canonicalHosts = ["tappyai.com", "www.tappyai.com", "tappyai.vn", "www.tappyai.vn"]
    private static let privatePrefixes = ["/api", "/chat", "/admin", "/auth", "/login"]

    /// True when a URL is safe to hand to another app.
    ///
    /// Same rules as web and Android: https, canonical host, no query string —
    /// that is where tokens live — and no private or internal route. A storage
    /// object URL fails the host check, so a Blob or Cloud Storage link can
    /// never be shared as though it were a page.
    static func isShareableURL(_ value: String?) -> Bool {
        guard let value, !value.isEmpty,
              let components = URLComponents(string: value),
              let scheme = components.scheme?.lowercased(),
              let host = components.host?.lowercased()
        else { return false }

        guard scheme == "https" else { return false }
        guard canonicalHosts.contains(host) else { return false }
        guard components.query == nil || components.query?.isEmpty == true else { return false }

        let path = components.path.isEmpty ? "/" : components.path
        for prefix in privatePrefixes where path == prefix || path.hasPrefix(prefix + "/") {
            return false
        }
        return true
    }

    /// The URL that opens a target's share dialog, or nil when there isn't one.
    ///
    /// nil is a real answer: TikTok publishes no web endpoint for handing off an
    /// arbitrary link, and `.copy`/`.native` are not handoffs. Callers copy the
    /// link instead — never fabricate a URL, never claim a post happened.
    static func buildShareURL(_ target: Target, canonicalURL: String) -> String? {
        guard isShareableURL(canonicalURL) else { return nil }
        guard let encoded = canonicalURL.addingPercentEncoding(
            withAllowedCharacters: .alphanumerics
        ) else { return nil }

        switch target {
        case .facebook:
            return "https://www.facebook.com/sharer/sharer.php?u=\(encoded)"
        case .zalo:
            return "https://sp.zalo.me/plugins/share?url=\(encoded)"
        case .tiktok, .copy, .native:
            return nil
        }
    }

    /// Canonical public URL for a review.
    static func reviewURL(_ reviewId: String) -> String {
        "\(canonicalOrigin)/reviews/\(reviewId)"
    }

    /// Canonical public URL for a group-dining room.
    ///
    /// A group is USELESS without this: the whole mechanism is "create a room, send the link,
    /// everyone fills in what they want to eat". Built here rather than in the view so it passes
    /// the same `isShareableURL` rules as every other outbound link.
    static func groupURL(_ groupId: String) -> String {
        "\(canonicalOrigin)/group/\(groupId)"
    }

    /// Canonical public URL for someone's profile.
    static func userProfileURL(_ userId: String) -> String {
        "\(canonicalOrigin)/users/\(userId)"
    }
}
