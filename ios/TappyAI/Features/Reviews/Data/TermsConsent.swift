import Foundation

/// The user's agreement to the Terms before their first review or comment (App Store 1.2: an app
/// with user-generated content must have users agree to terms that forbid objectionable content
/// and abusive users, before they can post).
///
/// There is no server field for this (neither rc/web-uat nor main has one), so it is stored on the
/// device, per terms version: bumping [currentVersion] asks everyone again on their next post.
struct TermsConsent {
    static let currentVersion = "2026-09"

    private let store: UserDefaultsStore

    init(store: UserDefaultsStore = UserDefaultsStore()) {
        self.store = store
    }

    var hasAccepted: Bool { store.string(.ugcTermsAccepted) == Self.currentVersion }

    func accept() { store.set(Self.currentVersion, .ugcTermsAccepted) }

    /// Runs [post] now if the terms are accepted; otherwise asks first. Returns true when it posted.
    @discardableResult
    func postOrAsk(ask: () -> Void, post: () -> Void) -> Bool {
        if hasAccepted {
            post()
            return true
        }
        ask()
        return false
    }
}
