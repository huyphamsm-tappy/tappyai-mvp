import Foundation

/// The Keychain outlives the app: delete TappyAI, install it again (or hand the phone on) and the old session is still there, so the
/// person lands signed in to the previous account. UserDefaults, by contrast, is deleted with the app - which makes it the signal for
/// "this is a new install" (security audit 04/11, I-04).
///
/// The first launch of an install finds the marker absent. If the app's defaults are also EMPTY, nothing of this app has ever run on this
/// install, so whatever the Keychain holds is left over from a previous one and is cleared. If they are not empty, this is an update of an
/// install that predates the marker: its session is the person's own and is left alone. When in doubt it clears nothing.
enum FreshInstallGuard {
    static let markerKey = "app.install.seen.v1"

    /// Clears `tokens` on the first launch of a fresh install. Returns true only when it cleared.
    @discardableResult
    static func run(defaults: UserDefaults = .standard,
                    appDomain: String = Bundle.main.bundleIdentifier ?? "",
                    tokens: TokenStorage) -> Bool {
        if defaults.bool(forKey: markerKey) { return false }
        let hadState = !(defaults.persistentDomain(forName: appDomain)?.isEmpty ?? true)
        defaults.set(true, forKey: markerKey)
        if hadState { return false }
        tokens.clear()
        return true
    }
}
