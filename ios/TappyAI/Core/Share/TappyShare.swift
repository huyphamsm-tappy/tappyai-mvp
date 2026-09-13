import Foundation

/// The share targets, mirroring the web contract in `src/lib/share/shareTargets.ts`
/// and the Android one in `TappyShare.kt`.
///
/// iOS already had `UIActivityViewController` / `ShareLink`, which is the right
/// primitive but not the whole experience: the system sheet shows whatever is
/// installed and gives the user no explicit Facebook / Zalo / Viber choice.
/// These targets sit on top; the system sheet remains "More apps".
///
/// TappyAI does not publish to any of these networks, so nothing here may
/// report that a post or a message was made. Every target either opens an app
/// WITH the brochure text where the app documents a way to receive it
/// (`buildTextShareURL`), or copies the brochure and opens the app so the user
/// pastes it — and the label says which.
enum TappyShare {

    /// Canonical public origin. Must match NEXT_PUBLIC_SITE_URL on the web.
    static let canonicalOrigin = "https://www.tappyai.com"

    enum Target: String, CaseIterable, Identifiable {
        case facebook
        case messenger
        case zalo
        case whatsapp
        case telegram
        case viber
        case line
        case tiktok
        case email
        case inbox
        case save
        case copy
        case native

        var id: String { rawValue }
    }

    /// Display order, identical to web and Android.
    static let targets: [Target] = [.facebook, .messenger, .zalo, .whatsapp, .telegram, .viber, .line, .tiktok, .email, .inbox, .save, .copy, .native]

    /// The URL scheme that tells whether a messaging app is installed (`canOpenURL`), or nil.
    ///
    /// Must stay identical to `LSApplicationQueriesSchemes` in Info.plist — iOS answers
    /// `false` for any scheme not declared there, and the sheet would then wrongly say
    /// "not installed". Facebook has no scheme: it is the sharer dialog with the brand
    /// url, the same as on the web; Messenger is the app a recommendation is sent to.
    static func appScheme(_ target: Target) -> String? {
        switch target {
        case .messenger: return "fb-messenger"
        case .zalo: return "zalo"
        case .whatsapp: return "whatsapp"
        case .telegram: return "tg"
        case .viber: return "viber"
        case .line: return "line"
        case .facebook, .tiktok, .email, .inbox, .save, .copy, .native: return nil
        }
    }

    /// Every scheme this app may query — Info.plist `LSApplicationQueriesSchemes` must list exactly these.
    static let queriedSchemes: [String] = ["fb-messenger", "zalo", "whatsapp", "tg", "viber", "line"]

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
    /// arbitrary link, and everything that is not a url handoff is nil too. Callers
    /// copy the brochure instead — never fabricate a URL, never claim a post happened.
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
        case .messenger:
            // Messenger's own share deep link (developers.facebook.com/docs/sharing/messenger).
            return "fb-messenger://share?link=\(encoded)"
        case .tiktok, .whatsapp, .telegram, .viber, .line, .email, .inbox, .save, .copy, .native:
            return nil
        }
    }

    /// Text carried inside a handoff URL has a practical ceiling — same bound as web and Android.
    static let textHandoffMax = 4000

    /// The URL that opens a target WITH THE BROCHURE TEXT in it, or nil.
    ///
    /// Mirrors the web `buildTextShareUrl`: `mailto:` (Mail), `viber://forward?text=`
    /// (Viber's documented forward endpoint), `https://line.me/R/share?text=` (LINE's
    /// documented share endpoint, a universal link into the app), `https://wa.me/?text=`
    /// (WhatsApp "click to chat") and `https://t.me/share/url?url=&text=` (Telegram's
    /// share widget — `url` is the canonical link it receives apart from the text).
    /// Zalo and Messenger document no text endpoint, so they are nil here and the
    /// sheet copies + opens.
    static func buildTextShareURL(_ target: Target, subject: String, text: String, url: String = "") -> String? {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return nil }
        let clipped = body.count > textHandoffMax ? String(body.prefix(textHandoffMax)) : body
        guard let enc = clipped.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
              let subj = subject.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
        else { return nil }

        switch target {
        case .email: return "mailto:?subject=\(subj)&body=\(enc)"
        case .viber: return "viber://forward?text=\(enc)"
        case .line: return "https://line.me/R/share?text=\(enc)"
        case .whatsapp: return "https://wa.me/?text=\(enc)"
        case .telegram:
            // When the text IS the link (a review), it goes once, as the url.
            let trimmedURL = url.trimmingCharacters(in: .whitespacesAndNewlines)
            let link = trimmedURL.isEmpty ? clipped : trimmedURL
            guard let encodedLink = link.addingPercentEncoding(withAllowedCharacters: .alphanumerics) else { return nil }
            return clipped == link
                ? "https://t.me/share/url?url=\(encodedLink)"
                : "https://t.me/share/url?url=\(encodedLink)&text=\(enc)"
        case .facebook, .messenger, .zalo, .tiktok, .inbox, .save, .copy, .native: return nil
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

    /// The web Inbox — the only Tappy Messenger there is. iOS opens it rather than cloning it.
    static let inboxURL = "\(canonicalOrigin)/profile/notifications?tab=messages"
}
