#if DEBUG
import Foundation

/// Lets the CI screenshot tests (`TappyAIUITests/ScreenshotTests`) open a screen directly instead of
/// tapping through every tab. DEBUG builds only — the Release/TestFlight archive does not contain
/// this file's code, so nothing here can be reached in a shipped app.
///
///   -uitest-route <hub|saved|viet|recs|explore|chat|home>   open that screen
///   -uitest-lang  <vi|en>                                    force the app language
@MainActor
enum UITestLaunch {
    static func apply(_ deps: AppDependencies) {
        let args = ProcessInfo.processInfo.arguments
        func value(_ flag: String) -> String? {
            guard let i = args.firstIndex(of: flag), args.indices.contains(i + 1) else { return nil }
            return args[i + 1]
        }
        if let lang = value("-uitest-lang").flatMap(AppLanguage.init(rawValue:)) {
            deps.localization.setLanguage(lang)
        }
        guard let route = value("-uitest-route") else { return }
        let router = deps.router
        switch route {
        case "home": router.switchTo(.home)
        case "chat": router.switchTo(.chat)
        case "explore": router.switchTo(.explore)
        case "hub": router.switchTo(.profile)
        case "saved":
            router.switchTo(.profile)
            router.push(ProfileDestination.favorites, on: .profile)
        case "viet":
            router.switchTo(.home)
            router.push(HomeDestination.vietContent, on: .home)
        case "recs":
            router.switchTo(.home)
            router.push(HomeDestination.recommendations, on: .home)
        default: break
        }
    }
}
#endif
