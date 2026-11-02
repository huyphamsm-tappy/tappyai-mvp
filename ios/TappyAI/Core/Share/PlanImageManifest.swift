import Foundation

/// The image manifest (R22, Android `PlanImageManifest.kt`): the ONE place an image key becomes a URL.
///
///     GET /api/plan-images/manifest
///     { "version": "2026-09-30.1",
///       "images": { "diem-karaoke": { "status": "active", "url": "https://…" },
///                   "diem-bar":     { "status": "replaced", "replacement": "diem-bar-rooftop" } } }
///
/// `active` → its https `url`; `replaced` → follow `replacement` (at most 3 hops, a cycle ends it);
/// anything else, a missing key or a non-https URL → nil → the caller draws its placeholder. The app
/// never substitutes a key of its own choosing.
struct PlanImageManifest: Equatable {
    struct Entry: Equatable { let status: String; let url: String?; let replacement: String? }

    let version: String?
    let entries: [String: Entry]

    static let empty = PlanImageManifest(version: nil, entries: [:])
    static let maxHops = 3

    func url(for key: String?) -> URL? {
        guard var k = key else { return nil }
        var seen = Set<String>()
        for _ in 0...Self.maxHops {
            guard seen.insert(k).inserted, let e = entries[k] else { return nil }
            switch e.status {
            case "active":
                guard let s = e.url, Self.isServable(s) else { return nil }
                return URL(string: s)
            case "replaced":
                guard let next = e.replacement, Self.isKey(next) else { return nil }
                k = next
            default:
                return nil
            }
        }
        return nil
    }

    /// Only https is ever loaded. DEBUG builds also accept the CI fixture server (`http://127.0.0.1:`), so a
    /// screenshot can show a real manifest image; a Release build compiles that line out.
    static func isServable(_ url: String) -> Bool {
        if url.hasPrefix("https://") { return true }
        #if DEBUG
        return url.hasPrefix("http://127.0.0.1:")
        #else
        return false
        #endif
    }

    /// Keys are lower-case slugs (`diem-karaoke`, `du-lich-bien-1`).
    static func isKey(_ s: String) -> Bool {
        s.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil && s.count <= 80
    }

    /// Lenient: a malformed entry is skipped, a malformed body is `empty`.
    static func parse(_ data: Data) -> PlanImageManifest {
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let images = root["images"] as? [String: Any] else { return .empty }
        var entries: [String: Entry] = [:]
        for (key, value) in images where isKey(key) {
            guard let o = value as? [String: Any], let status = o["status"] as? String else { continue }
            entries[key] = Entry(status: status, url: o["url"] as? String, replacement: o["replacement"] as? String)
        }
        return PlanImageManifest(version: root["version"] as? String, entries: entries)
    }
}

/// Fetches the manifest once per launch and keeps it; a failure (offline, route not deployed) is
/// retried at most every 10 minutes. Never blocks drawing: cards show placeholders until it arrives.
@MainActor
final class PlanImageStore: AppObservableObject {
    static let shared = PlanImageStore()

    @AppPublished private(set) var manifest = PlanImageManifest.empty
    private var loaded = false
    private var inFlight = false
    private var lastAttempt: Date?

    func ensureLoaded(api: APIClient) {
        guard !loaded, !inFlight else { return }
        if let last = lastAttempt, Date().timeIntervalSince(last) < 600 { return }
        inFlight = true
        lastAttempt = Date()
        Task {
            if let data = try? await api.send(Endpoint(path: "/api/plan-images/manifest")) {
                manifest = PlanImageManifest.parse(data)
                loaded = true
            }
            inFlight = false
        }
    }
}
