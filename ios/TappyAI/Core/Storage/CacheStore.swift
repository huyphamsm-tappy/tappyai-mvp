import Foundation

/// In-memory presentation cache with a TTL. Per ADR-007, ONLY presentation data is cached
/// (feed pages, catalog, images metadata) — never rules, prices, quotas, or entitlements.
/// Backed by `NSCache` so the system can evict under memory pressure.
final class CacheStore: @unchecked Sendable {
    private struct Entry { let value: Any; let expiresAt: Date }
    private let cache = NSCache<NSString, AnyObject>()
    private let clock: () -> Date

    init(countLimit: Int = 200, clock: @escaping () -> Date = Date.init) {
        cache.countLimit = countLimit
        self.clock = clock
    }

    private final class Box: NSObject { let entry: Entry; init(_ e: Entry) { entry = e } }

    func set<T>(_ value: T, for key: String, ttl: TimeInterval) {
        let entry = Entry(value: value, expiresAt: clock().addingTimeInterval(ttl))
        cache.setObject(Box(entry), forKey: key as NSString)
    }

    func value<T>(_ type: T.Type = T.self, for key: String) -> T? {
        guard let box = cache.object(forKey: key as NSString) as? Box else { return nil }
        guard box.entry.expiresAt > clock() else {
            cache.removeObject(forKey: key as NSString)
            return nil
        }
        return box.entry.value as? T
    }

    func remove(_ key: String) { cache.removeObject(forKey: key as NSString) }
    func clear() { cache.removeAllObjects() }
}
