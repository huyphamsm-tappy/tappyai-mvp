import Foundation

/// App-scoped owner of the unread-notification count (ADR-014).
///
/// **Why this is app-scoped and not part of `NotificationsViewModel`.** The badge has to be correct
/// on every tab, including tabs that have never opened the inbox, so the count cannot live in a
/// screen's view model — that model only exists while its screen is on the stack. Web solved the
/// same problem the same way: `BottomNav` reads `useNotifications().unreadCount` from a provider
/// above the router, not from the inbox page.
///
/// **Single source of truth.** `NotificationsViewModel` does not keep its own copy; it reads and
/// writes this store (see its `unreadCount` accessor). A second count is how a badge and a screen
/// end up disagreeing, so there is deliberately only one number in the app.
///
/// 🚨 **Injected as its own environment object, never reached through `AppDependencies`.** Reading
/// `deps.unreadNotifications.unreadCount` inside a `body` compiles and looks right, and the view
/// never re-renders: SwiftUI observes the object it was handed, and a nested `ObservableObject`
/// publishes nothing to the parent. `TappyAIApp` injects this alongside `session`/`router`/`theme`/
/// `localization` for exactly that reason, and the shell reads it with `@AppEnvironmentState`.
@MainActor
final class UnreadNotificationsStore: AppObservableObject {
    @AppPublished private(set) var unreadCount: Int = 0

    private let service: NotificationsService
    private let log = AppLogger.app

    init(service: NotificationsService) {
        self.service = service
    }

    /// Load the count without loading the inbox.
    ///
    /// `GET /api/notifications` is the only endpoint that reports `unreadCount`, and it returns the
    /// count for the whole account regardless of how many rows are asked for — so this asks for the
    /// smallest page the API will serve rather than pulling a screenful the badge would discard.
    func refresh() async {
        do {
            let response = try await service.fetchNotifications(limit: 1)
            unreadCount = response.unreadCount
        } catch {
            // A badge is ambient: a failed refresh leaves the last known count rather than
            // flashing an incorrect zero, and the inbox itself still reports its own load error.
            log.error("unread badge refresh failed: \(error)")
        }
    }

    /// Adopt a count the inbox already paid for, so opening the inbox does not cost a second call.
    func apply(unreadCount: Int) {
        self.unreadCount = unreadCount
    }

    /// Everything is read — reflect it immediately rather than waiting for the next fetch.
    func clear() {
        unreadCount = 0
    }
}
