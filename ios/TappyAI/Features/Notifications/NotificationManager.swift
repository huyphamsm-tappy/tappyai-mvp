import Combine
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
    /// The FCM token this device last held — the credential a sign-out / turn-off names, so it releases
    /// THIS device and never another one of the same account.
    private var lastToken: String?
    private var sessionSubscription: AnyCancellable?

    init(api: APIClient, deepLinks: DeepLinkHandler, router: AppRouter, session: SessionStore? = nil) {
        self.api = api
        self.deepLinks = deepLinks
        self.router = router
        super.init()
        UNUserNotificationCenter.current().delegate = self
        // The token is uploaded under the signed-in account. At launch that may be nobody yet (the upload
        // 401s), and a person who signs in later would get no push until the next launch — so register
        // again whenever an account signs in.
        sessionSubscription = session?.$state.removeDuplicates().sink { [weak self] state in
            guard case .authenticated = state else { return }
            Task { @MainActor in await self?.refreshRegistration() }
        }
    }

    /// Uploads the current FCM token for the signed-in account (no-op without Firebase, without permission,
    /// or before iOS has handed over the APNs token).
    func refreshRegistration() async {
        guard FirebaseSetup.isAvailable else { return }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
        if let token = try? await Messaging.messaging().token() { await uploadToken(token) }
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
        lastToken = token
        do {
            // `platform` is ignored by today's server (it reads provider + token only); it is sent so the
            // server can pick the APNs message format for an iOS token once it has one (IOS-REQUESTS I9).
            let body = try JSONSerialization.data(withJSONObject: [
                "provider": "fcm",
                "token": token,
                "platform": "ios",
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

    /// Turn push off for this device (Settings → Notifications): drop the local registration and disable
    /// the server-side subscription.
    func unsubscribe() async {
        UIApplication.shared.unregisterForRemoteNotifications()
        await releaseThisDevice()
        log.info("push unregistered")
    }

    /// `DELETE /api/notifications/subscribe` with `{provider:"fcm", credential:<this device's token>}`.
    ///
    /// 🚨 The provider and the credential go in the JSON BODY — the route reads `body.provider` and
    /// `body.credential`. This used to put `provider` in the query string, which the route ignores, so it
    /// defaulted to `webpush` and switched off the person's WEB push instead of this phone's. The
    /// credential narrows it to this device's token; without one (no token yet) nothing is sent, because
    /// a provider-only DELETE would disable whichever device the account's single fcm row now points at.
    /// Called before every sign-out, so a signed-out phone stops receiving the previous account's pushes.
    func releaseThisDevice() async {
        var token = lastToken
        if token == nil, FirebaseSetup.isAvailable { token = try? await Messaging.messaging().token() }
        guard let token, !token.isEmpty else { return }
        do {
            let body = try JSONSerialization.data(withJSONObject: ["provider": "fcm", "credential": token])
            _ = try await api.send(Endpoint(path: "/api/notifications/subscribe", method: .delete, body: body, requiresAuth: true))
            log.info("push subscription released for this device")
        } catch {
            log.info("push release failed — the token stays until it is rejected by FCM")
        }
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

extension NotificationManager {
    /// Where a notification opens. The server's FCM payload carries the target in `data.link`
    /// (`src/lib/notifications/fcm.ts`); the web push service worker uses `data.url`. Both are read, `link`
    /// first, and only a non-empty string counts. Whatever it is still goes through `DeepLinkHandler`,
    /// which refuses sign-in callbacks and anything that is not a known destination.
    nonisolated static func destination(in userInfo: [AnyHashable: Any]) -> String? {
        for key in ["link", "url"] {
            if let value = userInfo[key] as? String, !value.trimmingCharacters(in: .whitespaces).isEmpty { return value }
        }
        return nil
    }
}

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
        if let urlString = Self.destination(in: userInfo) {
            Task { @MainActor [self] in
                if let target = self.deepLinks.target(for: urlString) {
                    self.router.handle(target)
                }
            }
        }
        completionHandler()
    }
}
