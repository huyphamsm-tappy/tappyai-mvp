import SwiftUI

/// Sheets/full-screen covers presented app-wide. Feature cases are added later; a placeholder keeps
/// the type usable in Phase 0.
enum AppSheet: Identifiable, Hashable {
    case placeholder
    var id: String { String(describing: self) }
}

/// Central navigation state. One `NavigationPath` per tab (ADR-002 — TabView + NavigationStack per tab).
/// Feature destinations (Hashable values) are pushed by features later; the router itself is generic.
@MainActor
final class AppRouter: AppObservableObject {
    @AppPublished var selectedTab: AppTab = .home
    @AppPublished var paths: [AppTab: NavigationPath] = Dictionary(
        uniqueKeysWithValues: AppTab.allCases.map { ($0, NavigationPath()) }
    )
    @AppPublished var presentedSheet: AppSheet?

    private let log = AppLogger.navigation

    /// SwiftUI binding to a tab's navigation path (for `NavigationStack(path:)`).
    func path(for tab: AppTab) -> Binding<NavigationPath> {
        Binding(
            get: { self.paths[tab] ?? NavigationPath() },
            set: { self.paths[tab] = $0 }
        )
    }

    func switchTo(_ tab: AppTab) { selectedTab = tab }

    func push<V: Hashable>(_ value: V, on tab: AppTab? = nil) {
        let target = tab ?? selectedTab
        paths[target]?.append(value)
    }

    func pop(on tab: AppTab? = nil) {
        let target = tab ?? selectedTab
        if var p = paths[target], !p.isEmpty { p.removeLast(); paths[target] = p }
    }

    func popToRoot(on tab: AppTab? = nil) {
        let target = tab ?? selectedTab
        paths[target] = NavigationPath()
    }

    func present(_ sheet: AppSheet) { presentedSheet = sheet }
    func dismissSheet() { presentedSheet = nil }

    /// Route a resolved deep-link target into navigation state.
    func handle(_ target: DeepLinkTarget) {
        log.info("deep link → \(String(describing: target))")
        switch target {
        case .tab(let tab):
            popToRoot(on: tab)
            switchTo(tab)
        }
    }
}
