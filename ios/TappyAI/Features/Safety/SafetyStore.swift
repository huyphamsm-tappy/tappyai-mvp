import Combine
import Foundation

/// App-wide safety state: which surfaces the server has switched on, and whom the signed-in person has
/// blocked. Injected through `AppDependencies.safety`.
///
/// The SERVER is the authority on what a block hides (RLS hides both sides' posts and comments); this
/// store only lets the screens already on display drop a blocked person's items at once, without waiting
/// for the next fetch, and lets the block list screen render.
@MainActor
final class SafetyStore: AppObservableObject {
    @AppPublished private(set) var flags = SafetyFlags.off
    @AppPublished private(set) var blockedIds: Set<String> = []
    /// Set once a list has been loaded for the current session (so a screen can tell "none" from "not loaded").
    @AppPublished private(set) var blocksLoaded = false

    private let service: SafetyService
    private let config: AppConfigService
    private let session: SessionStore

    private var subscription: AnyCancellable?

    init(service: SafetyService, config: AppConfigService, session: SessionStore) {
        self.service = service; self.config = config; self.session = session
        // A different account (or none) is a different block list: reload on every session change.
        subscription = session.$state.removeDuplicates().dropFirst().sink { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    private var signedIn: Bool { session.state.isAuthenticated }

    /// Reads `/api/config` → `p8` and, when blocking is on and someone is signed in, the block list.
    /// Any failure leaves the previous values (a config outage must not switch safety UI on or off).
    func refresh() async {
        if let cfg = try? await config.config() { flags = SafetyFlags(cfg.p8) }
        guard flags.userBlocks, signedIn else {
            if !signedIn { blockedIds = []; blocksLoaded = false }
            return
        }
        if let list = try? await service.blocks() {
            blockedIds = Set(list.map(\.blockedId)); blocksLoaded = true
        }
    }

    /// Whether items authored by `userId` must not be shown.
    func isBlocked(_ userId: String?) -> Bool {
        guard let userId else { return false }
        return blockedIds.contains(userId)
    }

    /// Items not authored by someone blocked. `author` maps an item to its author's id.
    func visible<T>(_ items: [T], author: (T) -> String?) -> [T] {
        blockedIds.isEmpty ? items : items.filter { !isBlocked(author($0)) }
    }

    func report(_ request: ReportRequest) async -> ReportOutcome {
        do { try await service.report(request); return .sent }
        catch { return ReportOutcome.from(.failure(error)) }
    }

    /// Returns whether the block took effect.
    func block(_ userId: String) async -> Bool {
        do { try await service.block(userId: userId); blockedIds.insert(userId); blocksLoaded = true; return true }
        catch { return false }
    }

    func unblock(_ userId: String) async -> Bool {
        do { try await service.unblock(userId: userId); blockedIds.remove(userId); return true }
        catch { return false }
    }

    /// Signing out clears the list: it belongs to the account.
    func reset() { blockedIds = []; blocksLoaded = false }
}
