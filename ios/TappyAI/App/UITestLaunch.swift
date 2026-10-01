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

    /// A `plan-<area>` route shows the plan card v2 with a fixture plan of that area (travel carries stored image keys).
    static var planRoute: String? {
        guard let route = value("-uitest-route"), route.hasPrefix("plan-") else { return nil }
        return String(route.dropFirst(5))
    }

    /// The `places` route shows the place decision (chips, paged cards, fold, Maps footer) with a fixture of five places.
    static var placesRoute: Bool { value("-uitest-route") == "places" }

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
        case "chat-old":
            router.switchTo(.home)
            router.push(HomeDestination.conversation(id: "c-old"), on: .home)
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
        case "flight":
            // The flight ask the server adds (IOS-REQUESTS I-3): only «Bay từ đâu?» (id `origin`) is specified there.
            return [q("origin", "Bay từ đâu?", ["Từ TP.HCM", "Từ Hà Nội", "Từ nơi khác"])]
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

/// The place decision over the chat background: five fixture places, three above the fold, chips for the
/// open / top-rated / Wi-Fi splits, and each card's four decision actions (map, website, find reviews, call).
struct PlaceCardsGalleryView: View {
    var body: some View {
        ScrollView {
            PlaceCardsView(places: Self.places, mapsSearchURL: "https://www.google.com/maps/search/?api=1&query=bun+cha", shown: 3)
                .padding(16)
        }
        .background(TappyColor.background.ignoresSafeArea())
        .statusBarHidden(true)
    }

    private static func actions(_ name: String) -> [PersistedPlaceAction] {
        let q = name.replacingOccurrences(of: " ", with: "+")
        return [
            PersistedPlaceAction(kind: "maps", urlKind: "direct", url: "https://www.google.com/maps/search/?api=1&query=\(q)"),
            PersistedPlaceAction(kind: "website", urlKind: "direct", url: "https://example.vn/\(q)"),
            PersistedPlaceAction(kind: "review", urlKind: "search", url: "https://www.google.com/search?q=\(q)+review"),
            PersistedPlaceAction(kind: "call", urlKind: "direct", url: "tel:+84901234567"),
        ]
    }

    static let places: [PlaceCardView] = [
        PlaceCardView(id: "p1", name: "Bún chả Hương Liên", rank: 0, address: "24 Lê Văn Hưu, Hai Bà Trưng", rating: 4.6, ratingCount: 2300,
                      openNow: true, priceLevel: 1, categories: ["Quán bún", "Món Việt"], reasons: ["Gần chỗ bạn, đông khách địa phương"],
                      actions: actions("Bún chả Hương Liên"), flags: ["wifi"]),
        PlaceCardView(id: "p2", name: "Bún chả 34 Hàng Than", rank: 1, address: "34 Hàng Than, Ba Đình", rating: 4.2, ratingCount: 870,
                      openNow: false, priceLevel: 1, categories: ["Quán bún"], actions: actions("Bún chả 34 Hàng Than"), flags: []),
        PlaceCardView(id: "p3", name: "Chả cá Thăng Long", rank: 2, address: "6B Đường Thành, Hoàn Kiếm", rating: 4.5, ratingCount: 1500,
                      openNow: true, priceLevel: 2, actions: actions("Chả cá Thăng Long"), flags: ["wifi", "vegetarian"]),
        PlaceCardView(id: "p4", name: "Quán Ăn Ngon", rank: 3, address: "18 Phan Bội Châu", rating: 4.0, ratingCount: 3100,
                      openNow: true, actions: actions("Quán Ăn Ngon"), flags: []),
        PlaceCardView(id: "p5", name: "Nem Cua Bể Hải Phòng", rank: 4, address: "12 Ngô Quyền", rating: 3.9, ratingCount: 210,
                      openNow: false, actions: actions("Nem Cua Bể"), flags: []),
    ]
}

/// The plan card v2 over the chat background, fed a fixture `[TAPPY_PLAN]` block of one of the five areas
/// (the shape `docs/ios/IOS-REQUESTS` I-2 / Android R22 describe). Travel carries stored image KEYS that the
/// fixture server's manifest resolves; the others carry none, so they show the area placeholders.
struct PlanCardGalleryView: View {
    let area: String

    var body: some View {
        ScrollView {
            if let plan = Self.plan(area) {
                ChatPlanCardView(plan: plan, planJSON: nil, planShare: nil)
                    .padding(12)
            } else {
                Text("plan fixture did not decode").foregroundStyle(.red).accessibilityIdentifier("plan-fixture-failed")
            }
        }
        .background(Color(hex: 0x050814).ignoresSafeArea())
        .statusBarHidden(true)
    }

    static func plan(_ area: String) -> TappyPlan? {
        try? ResponseDecoder.json.decode(TappyPlan.self, from: Data(json(area).utf8))
    }

    private static func json(_ area: String) -> String {
        switch area {
        case "food":
            return #"""
            {"type":"evening","domain":"food","title":"Tối nay ăn gì ở Hà Nội","people":3,"budget_total":"650.000đ",
             "tagline":"Ba quán, một buổi tối no nê.","duration":"Tối nay · 18:00–21:30","destination":"Hoàn Kiếm, Hà Nội",
             "days":[{"label":"Tối nay","title":"Ăn theo khẩu vị nhóm","items":[
               {"time":"18:00","emoji":"🍜","name":"Phở Thìn Bờ Hồ","description":"Phở bò tái lăn, nước dùng ngọt xương","price":"70.000đ/tô","address":"13 Lò Đúc, Hai Bà Trưng"},
               {"time":"19:30","emoji":"🥢","name":"Bún chả Hương Liên","description":"Bún chả nướng than hoa","price":"chưa có giá","address":"24 Lê Văn Hưu"},
               {"time":"21:00","emoji":"☕","name":"The Note Coffee","description":"Cà phê ngắm hồ","price":"45.000đ","address":"64 Lương Văn Can"}]}],
             "highlights":[{"label":"Phở bò tái lăn"},{"label":"Bún chả than hoa"}]}
            """#
        case "entertainment":
            return #"""
            {"type":"evening","domain":"entertainment","title":"Tối thứ Sáu vui hết mình","people":4,"tagline":"Karaoke rồi bida, không cần nghĩ nhiều.",
             "duration":"Tối nay · 19:00–23:00","days":[{"label":"Tối nay","items":[
               {"time":"19:00","emoji":"🎤","name":"Karaoke Nice","description":"Phòng 4 người, có đồ ăn nhẹ","price":"300.000đ/giờ","address":"Quận 1"},
               {"time":"21:30","emoji":"🎱","name":"Bida Club 9","description":"Bàn lỗ, đông vui","address":"Quận 3"}]}]}
            """#
        case "shopping":
            return #"""
            {"type":"shopping","domain":"shopping","title":"Săn tai nghe chống ồn","people":1,"budget_total":"3.000.000đ","budget_per_person":"3.000.000đ",
             "days":[{"label":"Cuối tuần","items":[
               {"time":"10:00","emoji":"🎧","name":"Sony WH-1000XM4","description":"Chống ồn tốt, pin 30 giờ","price":"3.290.000đ","booking_link":"https://example.com/xm4"},
               {"time":"11:30","emoji":"🎧","name":"Anker Soundcore Q30","description":"Giá mềm, chống ồn khá","price":"chưa có giá"}]}],
             "highlights":[{"label":"Chống ồn chủ động"},{"label":"Pin trâu"}]}
            """#
        case "spa":
            return #"""
            {"type":"spa","domain":"spa","title":"Chiều thư giãn","people":2,"tagline":"Massage rồi gội đầu dưỡng sinh.","duration":"Chiều nay · 15:00–18:00",
             "days":[{"label":"Chiều nay","items":[
               {"time":"15:00","emoji":"💆","name":"Spa Lá Xanh","description":"Massage toàn thân 90 phút","price":"550.000đ","address":"Quận 3"},
               {"time":"17:00","emoji":"🌿","name":"Gội đầu dưỡng sinh Nhà Thuốc","description":"Gội đầu thảo dược","price":"chưa có giá"}]}],
             "local_tips":[{"text":"Đặt lịch trước 1 tiếng để có giờ đẹp.","basis":"general"}]}
            """#
        default:
            return #"""
            {"type":"trip","domain":"travel","title":"Quy Nhơn","people":2,"budget_total":"5.000.000đ","budget_per_person":"2.500.000đ/người",
             "destination":"Quy Nhơn, Bình Định","duration":"3 ngày · 2 đêm","hero_image":"du-lich-bien-1",
             "tagline":"Biển xanh, ẩm thực ngon, nhịp sống bình yên. Một chuyến đi, theo cách của bạn.",
             "days":[
              {"label":"Ngày 1","title":"Khám phá thành phố biển","items":[
               {"time":"09:00","emoji":"🏖️","name":"Bãi Kỳ Co","description":"Thiên đường biển hoang sơ với làn nước trong xanh","price":"250.000đ","address":"Xã Nhơn Lý, Quy Nhơn","image":"diem-bai-bien","maps_link":"https://maps.example.com/kyco"},
               {"time":"12:30","emoji":"🦐","name":"Hải sản Nhơn Lý","description":"Thưởng thức hải sản tươi ngon tại làng chài","price":"chưa có giá","address":"Làng chài Nhơn Lý","image":"diem-hai-san"},
               {"time":"18:30","emoji":"🌉","name":"Quảng trường Quy Nhơn","description":"Dạo biển, thưởng thức ẩm thực đường phố","price":"Miễn phí","address":"Đường Xuân Diệu","image":"diem-quang-truong"}]},
              {"label":"Ngày 2","title":"Thiên nhiên và văn hóa","items":[
               {"time":"08:00","emoji":"🏯","name":"Tháp Đôi","description":"Di tích Chăm Pa cổ kính giữa lòng thành phố","price":"20.000đ","address":"Đường Trần Hưng Đạo","image":"diem-di-san"},
               {"time":"12:00","emoji":"🥞","name":"Bánh xèo tôm nhảy","description":"Đặc sản Quy Nhơn không thể bỏ lỡ","price":"chưa có giá","address":"Đường Diên Hồng","image":"diem-hai-san"}]}],
             "highlights":[{"label":"Bãi biển tuyệt đẹp","image":"diem-bai-bien"},{"label":"Hải sản tươi ngon","image":"diem-hai-san"},
                           {"label":"Cảnh quan hùng vĩ","image":"diem-bai-bien"},{"label":"Di sản văn hóa","image":"diem-di-san"}],
             "cost_breakdown":{"Ăn uống":"1.800.000đ","Di chuyển":"1.200.000đ"},
             "local_tips":[{"text":"Đi Kỳ Co trước 9 giờ để tránh nắng và đông.","basis":"tool","place":"Bãi Kỳ Co"}]}
            """#
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
