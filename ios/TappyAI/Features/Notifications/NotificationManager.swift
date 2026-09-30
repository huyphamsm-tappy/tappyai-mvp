import Foundation
import UserNotifications
import UIKit
import FirebaseCore
import FirebaseMessaging

/// Manages the push lifecycle: permission check, FCM-token upload to
/// POST /api/notifications/subscribe (provider=fcm — the only mobile provider the backend accepts,
/// same as Android), foreground display, and notification-tap deep-link routing via the existing
/// DeepLinkHandler.
///
/// Firebase Cloud Messaging sits on top of APNs: the APNs device token is handed to Firebase, which
/// mints the FCM registration token the backend sends to. `FirebaseApp.configure()` needs the
/// `GoogleService-Info.plist` from the Firebase Console; a build without it (a fork, a CI run with
/// no secret) still works — push is simply inactive (`FirebaseSetup.isAvailable` is false).
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
        log.info("APNs token acquired")
        guard FirebaseSetup.isAvailable else {
            // No Firebase config in this build: the backend rejects a raw APNs token (`apns` is not
            // an accepted provider), so nothing is uploaded.
            log.info("Firebase not configured — push inactive")
            return
        }
        Messaging.messaging().delegate = self
        Messaging.messaging().apnsToken = tokenData
        // The FCM delegate only fires when the token CHANGES; fetch it now so every launch (and
        // every sign-in) re-registers the token for the current account.
        Task { [weak self] in
            if let token = try? await Messaging.messaging().token() { await self?.uploadToken(token) }
        }
    }

    func handleRegistrationError(_ error: Error) {
        log.error("APNs registration failed: \(error.localizedDescription)")
    }

    fileprivate func uploadToken(_ token: String) async {
        do {
            let body = try JSONSerialization.data(withJSONObject: [
                "provider": "fcm",
                "token": token,
            ])
            let endpoint = Endpoint(
                path: "/api/notifications/subscribe",
                method: .post,
                body: body,
                requiresAuth: true
            )
            _ = try await api.send(endpoint)
            log.info("FCM token uploaded")
        } catch {
            log.error("FCM token upload failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Unsubscribe

    func unsubscribe() async {
        UIApplication.shared.unregisterForRemoteNotifications()
        // The server-side subscription is turned off with DELETE /api/notifications/subscribe
        // (it only ever sets `enabled = false`); the local registration is dropped here.
        let endpoint = Endpoint(
            path: "/api/notifications/subscribe",
            method: .delete,
            query: [URLQueryItem(name: "provider", value: "fcm")],
            requiresAuth: true
        )
        _ = try? await api.send(endpoint)
        log.info("push unregistered")
    }

    // MARK: - Badge

    func clearBadge() {
        UNUserNotificationCenter.current().setBadgeCount(0) { _ in }
    }
}

// MARK: - Firebase

/// Firebase is configured only when the build carries a `GoogleService-Info.plist`
/// (added from a CI secret / the Firebase Console — never committed).
enum FirebaseSetup {
    static var isAvailable: Bool {
        Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
    }

    /// Call once, from `application(_:didFinishLaunchingWithOptions:)`. A no-op without the plist,
    /// and a no-op when already configured.
    static func configureIfAvailable() {
        guard isAvailable, FirebaseApp.app() == nil else { return }
        FirebaseApp.configure()
    }
}

extension NotificationManager: MessagingDelegate {
    /// A new / refreshed FCM registration token: upload it under `provider: "fcm"`.
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { @MainActor [self] in await self.uploadToken(fcmToken) }
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
