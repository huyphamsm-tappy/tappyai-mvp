import Foundation
import UserNotifications
import UIKit

/// Manages the full APNs lifecycle: permission check, device-token upload to
/// POST /api/notifications/subscribe (provider=apns), foreground display, and
/// notification-tap deep-link routing via the existing DeepLinkHandler.
@MainActor
final class NotificationManager: NSObject {
    private let api: APIClient
    private let deepLinks: DeepLinkHandler
    private let router: AppRouter
    private let log = AppLogger.app

    init(api: APIClient, deepLinks: DeepLinkHandler, router: AppRouter) {
        self.api = api
        self.deepLinks = deepLinks
        self.router = router
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    // MARK: - Permission & registration

    /// Silently registers for remote notifications if already authorised.
    /// Called on every launch so a refreshed APNs token is always uploaded.
    func registerIfAuthorized() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// Requests permission, then registers for remote notifications on grant.
    /// Returns whether the user granted permission.
    func requestPermissionAndRegister() async throws -> Bool {
        let granted = try await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .badge, .sound])
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
        return granted
    }

    // MARK: - Token handling (called from AppDelegate)

    func handleDeviceToken(_ tokenData: Data) {
        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
        log.info("APNs token acquired")
        Task { await uploadToken(hex) }
    }

    func handleRegistrationError(_ error: Error) {
        log.error("APNs registration failed: \(error.localizedDescription)")
    }

    private func uploadToken(_ token: String) async {
        do {
            let body = try JSONSerialization.data(withJSONObject: [
                "provider": "apns",
                "token": token,
            ])
            let endpoint = Endpoint(
                path: "/api/notifications/subscribe",
                method: .post,
                body: body,
                requiresAuth: true
            )
            _ = try await api.send(endpoint)
            log.info("APNs token uploaded")
        } catch {
            log.error("APNs token upload failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Unsubscribe

    func unsubscribe() async {
        UIApplication.shared.unregisterForRemoteNotifications()
        // Backend APNs unsubscription (DELETE /api/notifications/subscribe?provider=apns) is
        // deferred to the APNs Backend Production Sprint.
        log.info("APNs unregistered locally")
    }

    // MARK: - Badge

    func clearBadge() {
        UNUserNotificationCenter.current().setBadgeCount(0) { _ in }
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationManager: UNUserNotificationCenterDelegate {
    /// Show banner + sound + badge when the app is in the foreground (mirrors Web push-sw.js behaviour).
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    /// Handle tap → route `data.url` through the existing DeepLinkHandler (same map as web push-sw.js notificationclick).
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let urlString = userInfo["url"] as? String {
            Task { @MainActor [self] in
                if let target = self.deepLinks.target(for: urlString) {
                    self.router.handle(target)
                }
            }
        }
        completionHandler()
    }
}
