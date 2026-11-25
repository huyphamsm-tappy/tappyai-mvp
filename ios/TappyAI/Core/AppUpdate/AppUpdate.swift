import Foundation

/// «Có bản mới» — the in-app update notice (owner: «build bản mới mà user không biết thì sao được»).
///
/// An iOS app cannot install itself (App Review forbids it); what it can do is notice that the App Store has a newer
/// version than the one running and send the person to the store page. Two levels:
///  • SUGGEST — the App Store lists a newer version: a dialog with «Cập nhật» / «Để sau»; «Để sau» silences that
///    version for 24 hours.
///  • REQUIRE — the server says the running version is below `flags.iosMinVersion` (an old build with a serious bug):
///    a full-screen notice with only «Cập nhật» (the web session adds that field to `/api/config`; until it exists
///    nothing is ever required).
/// Everything here is pure except `fetchLatest`, so the decisions are unit-tested.

/// A dotted version such as `1.1.0`, compared numerically (`1.10` > `1.9`), missing parts read as 0.
struct AppVersion: Comparable, Equatable, Sendable {
    let parts: [Int]

    init?(_ text: String) {
        let pieces = text.trimmingCharacters(in: .whitespaces).split(separator: ".", omittingEmptySubsequences: false)
        guard (1...6).contains(pieces.count) else { return nil }
        var out: [Int] = []
        for piece in pieces {
            guard !piece.isEmpty, piece.count <= 6, piece.allSatisfy({ $0.isASCII && $0.isNumber }), let n = Int(piece) else { return nil }
            out.append(n)
        }
        parts = out
    }

    static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
        let count = max(lhs.parts.count, rhs.parts.count)
        for i in 0..<count {
            let l = i < lhs.parts.count ? lhs.parts[i] : 0
            let r = i < rhs.parts.count ? rhs.parts[i] : 0
            if l != r { return l < r }
        }
        return false
    }

    static func == (lhs: AppVersion, rhs: AppVersion) -> Bool { !(lhs < rhs) && !(rhs < lhs) }
}

/// What the App Store lookup says is current.
struct StoreRelease: Equatable, Sendable {
    let version: String
    let url: URL
}

enum UpdateDecision: Equatable {
    case none
    case suggest(StoreRelease)
    case require(StoreRelease)
}

enum AppUpdate {
    /// «Để sau» silences a version for this long.
    static let snooze: TimeInterval = 24 * 3600

    /// `GET https://itunes.apple.com/lookup?bundleId=…&country=vn` → `results[0].version` and `trackViewUrl`.
    /// Only an https link on an Apple store host is accepted: the person is sent nowhere else.
    static func parseLookup(_ data: Data) -> StoreRelease? {
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let first = (root["results"] as? [[String: Any]])?.first,
              let version = first["version"] as? String, AppVersion(version) != nil,
              let link = first["trackViewUrl"] as? String, let url = URL(string: link),
              url.scheme == "https", let host = url.host?.lowercased(),
              host == "apps.apple.com" || host == "itunes.apple.com" else { return nil }
        return StoreRelease(version: version, url: url)
    }

    /// The decision. `minimum` is the server's `flags.iosMinVersion` (nil = none). A required update beats a suggestion;
    /// without a store link there is nothing to send the person to, so nothing is shown.
    static func decide(installed: String, store: StoreRelease?, minimum: String?,
                       snoozedVersion: String?, snoozedAt: Date?, now: Date) -> UpdateDecision {
        guard let running = AppVersion(installed), let store else { return .none }
        if let minimum, let floor = AppVersion(minimum), running < floor { return .require(store) }
        guard let latest = AppVersion(store.version), running < latest else { return .none }
        if snoozedVersion == store.version, let snoozedAt, now.timeIntervalSince(snoozedAt) < snooze { return .none }
        return .suggest(store)
    }

    /// Asks the App Store. Nil on any failure (offline, the app is not listed yet): then nothing is shown.
    static func fetchLatest(bundleId: String, session: URLSession = .shared) async -> StoreRelease? {
        var components = URLComponents(string: "https://itunes.apple.com/lookup")
        components?.queryItems = [URLQueryItem(name: "bundleId", value: bundleId), URLQueryItem(name: "country", value: "vn")]
        guard let url = components?.url else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        request.httpMethod = "GET"
        guard let (data, response) = try? await session.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return parseLookup(data)
    }
}

/// Remembers «Để sau» (per version) and when the store was last asked.
struct AppUpdateMemory {
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    var snoozedVersion: String? { defaults.string(forKey: "update.snoozedVersion") }
    var snoozedAt: Date? { defaults.object(forKey: "update.snoozedAt") as? Date }
    var lastChecked: Date? { defaults.object(forKey: "update.lastChecked") as? Date }

    func snooze(version: String, now: Date = Date()) {
        defaults.set(version, forKey: "update.snoozedVersion")
        defaults.set(now, forKey: "update.snoozedAt")
    }

    func markChecked(now: Date = Date()) { defaults.set(now, forKey: "update.lastChecked") }
}
