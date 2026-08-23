import SwiftUI

@main
struct TappyAIApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @AppStateObject private var deps = AppDependencies()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(deps)
                .environmentObject(deps.session)
                .environmentObject(deps.router)
                .environmentObject(deps.theme)
                .environmentObject(deps.localization)
                // Its own environment object, not read through `deps`: a nested `ObservableObject`
                // publishes nothing to the view holding the parent, so the badge would never update.
                .environmentObject(deps.unreadNotifications)
                .task { deps.bootstrap() }
                .onOpenURL { deps.handleDeepLink($0.absoluteString) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL else { return }
                    deps.handleDeepLink(url.absoluteString)
                }
        }
        .onChange(of: scenePhase) { newPhase in
            switch newPhase {
            case .active:
                AppLogger.app.debug("scene: active")
                deps.notificationManager.clearBadge()
                // Covers both launch and return-from-background, which is when the count is most
                // likely to have moved. `/api/notifications` requires auth, so an anonymous or
                // signed-out session gets the count zeroed instead of keeping the previous
                // account's number on screen.
                Task {
                    if deps.session.state.isAuthenticated {
                        await deps.unreadNotifications.refresh()
                    } else {
                        deps.unreadNotifications.clear()
                    }
                }
            case .inactive: AppLogger.app.debug("scene: inactive")
            case .background: AppLogger.app.debug("scene: background")
            @unknown default: break
            }
        }
    }
}
