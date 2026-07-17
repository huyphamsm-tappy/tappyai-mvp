import UIKit

/// Minimal app delegate for lifecycle + remote-notification registration hooks. No product logic.
final class AppDelegate: NSObject, UIApplicationDelegate {
    private let log = AppLogger.app

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        log.info("didFinishLaunching")
        return true
    }

    // MARK: Remote notifications

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in
            DIContainer.shared.resolve(NotificationManager.self).handleDeviceToken(deviceToken)
        }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in
            DIContainer.shared.resolve(NotificationManager.self).handleRegistrationError(error)
        }
    }

    func applicationDidReceiveMemoryWarning(_ application: UIApplication) {
        log.error("memory warning — releasing caches")
    }
}
