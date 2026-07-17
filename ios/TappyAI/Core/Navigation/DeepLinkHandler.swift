import Foundation

/// A resolved deep-link destination. Feature-specific targets (a review id, a sound id) are added
/// with the features; Phase 0 resolves tab-level links only, mirroring the notification `data.url`
/// map (docs/ios/04 personalization).
enum DeepLinkTarget: Equatable {
    case tab(AppTab)
}

/// Parses inbound URLs (custom scheme `tappyai://…`, universal links, and push `data.url` paths)
/// into `DeepLinkTarget`. Pure and unit-testable.
struct DeepLinkHandler {
    /// Accepts either a full URL or a bare web path like `/reviews`.
    func target(for urlOrPath: String) -> DeepLinkTarget? {
        let path: String
        if let url = URL(string: urlOrPath), url.scheme != nil {
            // For custom-scheme URLs (tappyai://chat), Foundation parses the segment after "://"
            // as the host, not the path. Universal links (https://…/chat) set url.path correctly.
            if url.path.isEmpty {
                path = url.host.map { "/" + $0 } ?? "/"
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
        // Longest-prefix match against the tab web paths.
        if normalized == "/" { return .tab(.home) }
        for tab in AppTab.allCases where tab.webPath != "/" && normalized.hasPrefix(tab.webPath) {
            return .tab(tab)
        }
        return nil
    }
}
