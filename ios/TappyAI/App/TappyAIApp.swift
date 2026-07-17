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
            case .inactive: AppLogger.app.debug("scene: inactive")
            case .background: AppLogger.app.debug("scene: background")
            @unknown default: break
            }
        }
    }
}
