import Foundation

/// A resolved deep-link destination.
///
/// ============================================================================
/// WHY THE ID-BEARING CASES EXIST
/// ============================================================================
/// This used to resolve TAB-LEVEL links only. Every id in the path was discarded by the
/// longest-prefix match: `/reviews/abc123` matched the Explore tab's `/reviews` prefix and opened
/// the feed, `/users/xyz` matched nothing at all, and `/group/g1` — the link a group's entire
/// mechanism depends on being sent to other people — did nothing.
///
/// So the one thing a shared link exists to do, it could not do. These cases carry the id through
/// to `AppRouter`, which pushes the matching screen onto the destination tab.
enum DeepLinkTarget: Equatable {
    case tab(AppTab)
    /// `/reviews/{id}` — a shared review.
    case review(id: String)
    /// `/users/{id}` — someone's public profile.
    case userProfile(id: String)
    /// `/group/{id}` — a group-dining room.
    case group(id: String)
    /// `/group/new` — the create-a-group screen.
    case groupCreate
    /// `/copyright` — the music copyright policy.
    case copyrightPolicy
}

/// Parses inbound URLs (custom scheme `tappyai://…`, universal links, and push `data.url` paths)
/// into `DeepLinkTarget`. Pure and unit-testable.
struct DeepLinkHandler {
    /// An id that may be written into an API path: 1-64 of `A-Za-z0-9_-` (this admits every UUID and the server's short ids).
    static func isSafeId(_ id: String) -> Bool {
        (1...64).contains(id.utf8.count) && id.utf8.allSatisfy { b in
            (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || b == 0x5F || b == 0x2D
        }
    }

    /// Accepts either a full URL or a bare web path like `/reviews`.
    func target(for urlOrPath: String) -> DeepLinkTarget? {
        let path: String
        if let url = URL(string: urlOrPath), url.scheme != nil {
            // MOB-1: a sign-in callback opened from outside (Safari, another app, a message) is
            // never a destination and never imports a session. Only the web-auth session the app
            // itself started receives callbacks, and it checks their state.
            if AuthCallbackURL.isAuthCallback(url) { return nil }
            // For custom-scheme URLs (tappyai://chat), Foundation parses the segment after "://"
            // as the host, not the path. Universal links (https://…/chat) set url.path correctly.
            if url.path.isEmpty {
                path = url.host.map { "/" + $0 } ?? "/"
            } else if let host = url.host, url.scheme?.hasPrefix("http") == false {
                // tappyai://reviews/abc → host "reviews", path "/abc". Rejoin them so the custom
                // scheme resolves to the same target as the https link it mirrors.
                path = "/" + host + url.path
            } else {
                path = url.path
            }
        } else {
            path = urlOrPath
        }
        return target(forPath: path)
    }

    func target(forPath path: String) -> DeepLinkTarget? {
        let normalized = path.hasPrefix("/") ? path : "/" + path
        if normalized == "/" { return .tab(.home) }

        // Content links are matched BEFORE the tab prefixes. `/reviews/{id}` also has the Explore
        // tab's `/reviews` prefix, and whichever is checked first wins — checking the tab first is
        // precisely the bug this ordering fixes.
        let segments = normalized.split(separator: "/").map(String.init)
        if segments.count >= 2 {
            let id = segments[1]
            // Security audit 04/11 (I-06): the id goes into an API path (`/api/group/{id}/join`) with the person's token. A link or push
            // carrying `..`, `?`, `#`, `%2f`… would redirect that call inside our own API, so only a plain id (or UUID) is taken, and a
            // content link with any other id resolves to nothing.
            if ["reviews", "users", "group"].contains(segments[0]), id != "new", !Self.isSafeId(id) { return nil }
            if !id.isEmpty {
                switch segments[0] {
                case "reviews": return .review(id: id)
                case "users": return .userProfile(id: id)
                // `/group/new` is the CREATE screen, not a room with the id "new".
                case "group": return id == "new" ? .groupCreate : .group(id: id)
                default: break
                }
            }
        }
        if segments.first == "copyright" { return .copyrightPolicy }

        // Longest-prefix match against the tab web paths.
        for tab in AppTab.allCases where tab.webPath != "/" && normalized.hasPrefix(tab.webPath) {
            return .tab(tab)
        }
        return nil
    }
}
