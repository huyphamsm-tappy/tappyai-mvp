import SwiftUI

/// The debug-only overlay the app root carries. In a Release build it is an empty view.
struct UITestOverlay: View {
    var body: some View {
        #if DEBUG
        if let layout = UITestLaunch.cardRoute {
            CardGalleryView(layout: layout)
        } else if let area = UITestLaunch.askRoute {
            AskCardGalleryView(area: area)
        } else if let area = UITestLaunch.planRoute {
            PlanCardGalleryView(area: area)
        } else if UITestLaunch.placesRoute {
            PlaceCardsGalleryView()
        } else if let state = UITestLaunch.voiceRoute {
            VoiceGalleryView(state: state)
        }
        #else
        EmptyView()
        #endif
    }
}

#if DEBUG
/// Lets the CI screenshot tests (`TappyAIUITests/ScreenshotTests`) open a screen directly instead of
/// tapping through every tab. DEBUG builds only — the Release/TestFlight archive does not contain
/// this file's code, so nothing here can be reached in a shipped app.
///
///   -uitest-route <hub|saved|viet|recs|explore|chat|home|card-review|card-clip|card-suggestion|card-plan|card-qr>
///   -uitest-lang  <vi|en>                                    force the app language
///   -uitest-theme dark                                       dark appearance (else system)
@MainActor
enum UITestLaunch {
    private static func value(_ flag: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: flag), args.indices.contains(i + 1) else { return nil }
        return args[i + 1]
    }

    /// A `card-*` route shows one rendered share card full screen.
    static var cardRoute: ShareCardLayout? {
        switch value("-uitest-route") {
        case "card-review": return .review
        case "card-clip": return .clip
        case "card-suggestion": return .suggestion
        case "card-plan": return .plan
        case "card-qr": return .profile
        default: return nil
        }
    }

    /// App Store pictures: the Debug-only Diagnostics button is not drawn, so the picture shows what a store build shows.
    static var isAppStoreShot: Bool { ProcessInfo.processInfo.arguments.contains("-uitest-appstore") }

    /// An `ask-<area>` route shows the ask card v2 with the router's real questions for that area.
    static var askRoute: String? {
        guard let route = value("-uitest-route"), route.hasPrefix("ask-") else { return nil }
        return String(route.dropFirst(4))
    }

    /// A `plan-<area>` route shows the plan card v2 with a fixture plan of that area (travel carries stored image keys).
    static var planRoute: String? {
        guard let route = value("-uitest-route"), route.hasPrefix("plan-") else { return nil }
        return String(route.dropFirst(5))
    }

    /// Scam Shield fixtures: `-uitest-scam-pane <check|message|qr>`, `-uitest-scam-message <text>`, `-uitest-scam-qr <payload>`.
    /// The QR payload is drawn into a real QR picture on the phone and read back through the real decoder.
    static var scamPane: String? { value("-uitest-scam-pane") }
    static var scamMessage: String? { value("-uitest-scam-message") }
    static var scamQR: String? { value("-uitest-scam-qr") }

    /// A `voice-<idle|text|error>` route shows the listening screen in that state (fixture recogniser, no microphone).
    static var voiceRoute: String? {
        guard let route = value("-uitest-route"), route.hasPrefix("voice-") else { return nil }
        return String(route.dropFirst(6))
    }

    /// The `places` route shows the place decision (chips, paged cards, fold, Maps footer) with a fixture of five places.
    static var placesRoute: Bool { value("-uitest-route") == "places" }

    static func apply(_ deps: AppDependencies) {
        // Fixture tests are not about the AI-sharing sheet: they start agreed. The consent tests ask for the
        // un-agreed state (`-uitest-ai-consent-prompt`), and because the choice is persisted it is reset either way.
        if value("-uitest-route") != nil {
            if ProcessInfo.processInfo.arguments.contains("-uitest-ai-consent-prompt") {
                deps.aiConsent.withdraw()
            } else {
                deps.aiConsent.agree()
            }
        }
        if let lang = value("-uitest-lang").flatMap(AppLanguage.init(rawValue:)) {
            deps.localization.setLanguage(lang)
        }
        // The Android references are dark; a test asks for dark, every other test gets the system look
        // back (the mode is persisted, so an earlier test must not leak into the next one).
        if value("-uitest-route") != nil {
            switch value("-uitest-theme") {
            case "dark": deps.theme.mode = .dark
            case "light": deps.theme.mode = .light
            default: deps.theme.mode = .system
            }
        }
        // A signed-in look for the fixture server only: an unsigned token whose `sub` is the fixture
        // user. The fixture server does not verify it; a real backend would reject it.
        let signedIn = ProcessInfo.processInfo.arguments.contains("-uitest-signed-in")
        // `-uitest-expired`: the same account but an access token already past its expiry, so the first API call
        // tries to renew it, fails, and the app must fall back to guest with the «session ended» notice.
        let expired = ProcessInfo.processInfo.arguments.contains("-uitest-expired")
        if signedIn || expired {
            let payload = Data(#"{"sub":"uitest-user"}"#.utf8).base64EncodedString()
                .replacingOccurrences(of: "=", with: "")
            deps.session.didAuthenticate(AuthTokens(accessToken: "e30.\(payload).sig", refreshToken: "uitest",
                                                    expiresAt: Date().addingTimeInterval(expired ? -60 : 3600)), onboarded: true)
        } else if value("-uitest-route") != nil {
            // Every other test is a guest: drop a session an earlier test left in the Keychain.
            deps.session.logout()
        }
        guard let route = value("-uitest-route") else { return }
        let router = deps.router
        switch route {
        case "home": router.switchTo(.home)
        case "chat": router.switchTo(.chat)
        case "explore": router.switchTo(.explore)
        case "deals": router.switchTo(.deals)
        case "hub": router.switchTo(.profile)
        case "settings":
            router.switchTo(.profile)
            router.push(ProfileDestination.settings, on: .profile)
        case "safety-user":
            router.switchTo(.profile)
            router.push(ReviewsDestination.userProfile(id: "u2"), on: .profile)
        case "safety-review":
            router.switchTo(.profile)
            router.push(ReviewsDestination.reviewDetail(id: "r-safety"), on: .profile)
        case "chat-old", "conv-old", "conv-ask", "conv-plan", "conv-store":
            // A saved chat from the fixture server (`history` mode): chat-old/conv-old = places, conv-ask, conv-plan,
            // conv-store = the places chat as drawn for the App Store picture.
            router.switchTo(.home)
            let id = route == "conv-ask" ? "c-ask" : route == "conv-plan" ? "c-plan" : route == "conv-store" ? "c-store" : "c-old"
            router.push(HomeDestination.conversation(id: id), on: .home)
        case "scam":
            router.switchTo(.home)
            router.push(HomeDestination.scamShield, on: .home)
        case "saved":
            router.switchTo(.profile)
            router.push(ProfileDestination.favorites, on: .profile)
        case "translate":
            router.switchTo(.home)
            router.push(HomeDestination.translate, on: .home)
        case "scan":
            router.switchTo(.home)
            router.push(HomeDestination.scan, on: .home)
        case "group":
            router.switchTo(.home)
            router.push(HomeDestination.groupDining, on: .home)
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
