import SwiftUI

/// The debug-only overlay the app root carries. In a Release build it is an empty view.
struct UITestOverlay: View {
    var body: some View {
        #if DEBUG
        if let layout = UITestLaunch.cardRoute {
            CardGalleryView(layout: layout)
        } else if let area = UITestLaunch.askRoute {
            AskCardGalleryView(area: area)
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

    /// An `ask-<area>` route shows the ask card v2 with the router's real questions for that area.
    static var askRoute: String? {
        guard let route = value("-uitest-route"), route.hasPrefix("ask-") else { return nil }
        return String(route.dropFirst(4))
    }

    static func apply(_ deps: AppDependencies) {
        if let lang = value("-uitest-lang").flatMap(AppLanguage.init(rawValue:)) {
            deps.localization.setLanguage(lang)
        }
        // The Android references are dark; a test asks for dark, every other test gets the system look
        // back (the mode is persisted, so an earlier test must not leak into the next one).
        if value("-uitest-route") != nil {
            deps.theme.mode = value("-uitest-theme") == "dark" ? .dark : .system
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

/// The ask card v2 over the chat background, fed the question sets the router really emits
/// (web `askCardModel.test.ts`). The sent text is printed under it so a test can read it.
struct AskCardGalleryView: View {
    let area: String
    @State private var sent: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                AskCardView(questions: Self.questions(area)) { sent = $0 }
                if let sent {
                    Text(sent).font(.footnote).foregroundStyle(.white).accessibilityIdentifier("ask-sent")
                }
            }
            .padding(12)
        }
        .background(Color(hex: 0x050814).ignoresSafeArea())
        .statusBarHidden(true)
    }

    static func questions(_ area: String) -> [AskQuestion] {
        func q(_ id: String, _ text: String, _ options: [String]) -> AskQuestion { AskQuestion(id: id, q: text, options: options) }
        switch area {
        case "food":
            return [q("dish", "Món gì / kiểu quán?", ["Món Việt", "Nhật/Hàn", "Lẩu/nướng", "Chưa biết"]),
                    q("mode", "Ăn tại quán hay giao?", ["Ăn tại quán", "Giao tận nơi"]),
                    q("area", "Khu vực nào?", ["Gần mình", "Quận 1", "Quận 3", "Quận 7"])]
        case "spa":
            return [q("service", "Muốn làm dịch vụ gì?", ["Massage", "Gội đầu dưỡng sinh", "Xông hơi", "Chăm sóc da"]),
                    q("time", "Khi nào đi?", ["Hôm nay", "Tối nay", "Cuối tuần"])]
        case "travel":
            return [q("date", "Đi khi nào, mấy ngày?", ["Cuối tuần 2N1Đ", "3N2Đ", "4-5 ngày", "Chưa chốt"]),
                    q("origin", "Xuất phát từ đâu?", ["TP.HCM", "Hà Nội", "Đà Nẵng", "Nơi khác"]),
                    q("style", "Thích kiểu gì?", ["Biển", "Núi", "Ăn uống", "Nghỉ dưỡng"])]
        case "shopping":
            return [q("line", "Loại nào?", ["Nhét tai", "Chụp tai", "Chưa biết"]),
                    q("budget", "Tầm giá bao nhiêu?", ["Dưới 1tr", "1-3tr", "3-5tr", "Trên 5tr"]),
                    q("must", "Cần chống ồn không?", ["Có chống ồn", "Không cần"])]
        default:
            return [q("activity", "Muốn chơi gì?", ["Karaoke", "Xem phim", "Bar/pub", "Bida/bowling"]),
                    q("party", "Mấy người / đi với ai?", ["1 mình", "2 người", "Nhóm 3-5", "Nhóm đông"]),
                    q("time", "Đi lúc mấy giờ?", ["Chiều nay", "Tối nay", "Cuối tuần"])]
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
