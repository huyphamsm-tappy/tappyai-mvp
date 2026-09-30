import SwiftUI

/// The debug-only overlay the app root carries. In a Release build it is an empty view.
struct UITestOverlay: View {
    var body: some View {
        #if DEBUG
        if let layout = UITestLaunch.cardRoute {
            CardGalleryView(layout: layout)
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

    static func apply(_ deps: AppDependencies) {
        if let lang = value("-uitest-lang").flatMap(AppLanguage.init(rawValue:)) {
            deps.localization.setLanguage(lang)
        }
        // A signed-in look for the fixture server only: an unsigned token whose `sub` is the fixture
        // user. The fixture server does not verify it; a real backend would reject it.
        if ProcessInfo.processInfo.arguments.contains("-uitest-signed-in") {
            let payload = Data(#"{"sub":"uitest-user"}"#.utf8).base64EncodedString()
                .replacingOccurrences(of: "=", with: "")
            deps.session.didAuthenticate(AuthTokens(accessToken: "e30.\(payload).sig", refreshToken: "uitest",
                                                    expiresAt: Date().addingTimeInterval(3600)), onboarded: true)
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

/// Renders ONE share card from fixtures with the real renderer and shows it full screen, so CI can
/// photograph exactly the file a user would save or send. Photos come from the fixture server.
struct CardGalleryView: View {
    let layout: ShareCardLayout
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let image {
                Image(uiImage: image).resizable().scaledToFit().ignoresSafeArea()
                    .accessibilityIdentifier("card-preview")
            } else if failed {
                Text("render failed").foregroundStyle(.white).accessibilityIdentifier("card-failed")
            } else {
                ProgressView().tint(.white)
            }
        }
        .statusBarHidden(true)
        .task {
            let card = await ShareCardFiles().card(Self.input(layout))
            image = card?.image
            failed = card == nil
        }
    }

    private static let photo = "http://127.0.0.1:3000/img/"

    static func input(_ layout: ShareCardLayout) -> ShareCardInput {
        let url = "https://www.tappyai.com/reviews/demo"
        switch layout {
        case .review, .clip:
            let clip = layout == .clip
            let post = SharePostCard(
                kind: clip ? .clip : .review, title: clip ? "Cuối tuần ở Đà Lạt" : "Phở Thìn Bờ Hồ",
                placeName: clip ? nil : "Phở Thìn Bờ Hồ",
                address: clip ? nil : "13 Lò Đúc, Hai Bà Trưng, Hà Nội", rating: clip ? nil : 5,
                excerpt: "Nước dùng ngọt xương, thịt bò tái lăn thơm, bánh phở mềm. Quán đông nhưng lên món nhanh, đáng thử một lần.",
                author: "Minh Anh", image: photo + "a.png")
            return ShareCardInput(layout: layout, url: url, post: post, lang: "vi")
        case .suggestion:
            let places = [
                SharedPlace(name: "Phở Thìn Bờ Hồ", category: "Quán phở", rating: 4.6, ratingCount: 128,
                            address: "13 Lò Đúc, Hai Bà Trưng, Hà Nội", priceRangeText: "50–70k", image: photo + "b.png"),
                SharedPlace(name: "The Note Coffee", category: "Cà phê", rating: 4.4, ratingCount: 57,
                            address: "64 Lương Văn Can, Hoàn Kiếm, Hà Nội", image: photo + "c.png"),
                SharedPlace(name: "Bún chả Hương Liên", category: "Bún chả", rating: 4.5),
            ]
            return ShareCardInput(layout: layout, url: TappyShare.canonicalOrigin, subject: "Quán ăn ngon gần Hồ Gươm",
                                  places: places, lang: "vi")
        case .plan:
            func item(_ t: String, _ n: String, _ d: String, _ a: String, _ p: String?) -> PlanCardData.Item {
                PlanCardData.Item(time: t, name: n, description: d, address: a, photoUrl: p)
            }
            let plan = PlanCardData(
                title: "Đà Lạt 3 ngày 2 đêm",
                days: [
                    .init(label: "Ngày 1", items: [
                        item("08:00", "Cà phê Túi Mơ To", "Bữa sáng view đồi thông", "Lý Thường Kiệt, Đà Lạt", photo + "a.png"),
                        item("11:00", "Hồ Xuân Hương", "Đi dạo quanh hồ", "Trung tâm Đà Lạt", photo + "b.png"),
                        item("19:00", "Lẩu gà lá é Tao Ngộ", "Bữa tối", "Đường 3/2, Đà Lạt", nil),
                    ]),
                    .init(label: "Ngày 2", items: [
                        item("06:00", "Săn mây Cầu Đất", "Bình minh trên đồi chè", "Cầu Đất, Xuân Trường", photo + "c.png"),
                        item("14:00", "Thung lũng Tình Yêu", "Chụp ảnh, chèo thuyền", "Phù Đổng Thiên Vương", photo + "d.png"),
                    ]),
                ],
                people: 2, budgetTotal: "4.500.000đ", summary: "Chuyến đi chậm rãi, nhiều cà phê và săn mây.")
            return ShareCardInput(layout: layout, url: "https://www.tappyai.com/plan/demo", plan: plan, lang: "vi")
        case .profile, .post:
            return ShareCardInput(layout: .profile, url: "https://www.tappyai.com/users/demo", displayName: "Minh Anh", lang: "vi")
        }
    }
}
#endif
