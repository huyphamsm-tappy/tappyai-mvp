import SwiftUI
import UIKit

/// THE ONE card-file generator — port of web `src/lib/share/shareCardFile.ts` and Android
/// `ShareCardFile.kt`. The LAYOUT decides the file (owner picks 29/09):
///  - `profile` / `post`   the TappyAI QR card (`BrandedQrCardView`)
///  - `review` / `clip`    an Explore post's own card (`PostCardView`)
///  - `suggestion`         a chat recommendation's places (`SuggestionCardView`)
///  - `plan`               the itinerary image (`PlanCardView`)
///
/// 🔑 ONE FILE. The share sheet renders the chosen layout ONCE per (layout, link), shows that very
/// image as its preview, and hands the SAME file to "Lưu về máy", to TikTok and to the system share
/// sheet (`ShareCardFiles.card`). Changing the layout changes the preview and the file together.
enum ShareCardLayout: String, CaseIterable, Sendable {
    case profile, post, review, clip, suggestion, plan

    /// The file-name tag: `tappyai-<tag>-YYYY-MM-DD.png`.
    var fileTag: String { rawValue }

    /// The layouts a share offers, in order — the first is the default selection (web `shareCardLayouts`).
    static func offered(post: SharePostCard?, isProfile: Bool, hasPlan: Bool, hasPlaces: Bool) -> [ShareCardLayout] {
        if isProfile { return [.profile] }
        if let post { return [post.kind == .clip ? .clip : .review, .post] }
        if hasPlan { return [.plan] }
        if hasPlaces { return [.suggestion] }
        return []
    }

    /// `tappyai-<layout>-YYYY-MM-DD.png` — the saved file says which layout produced it.
    func fileName(now: Date = Date()) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .current
        let c = cal.dateComponents([.year, .month, .day], from: now)
        return String(format: "tappyai-%@-%04d-%02d-%02d.png", fileTag, c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

/// What a card may be drawn from.
struct ShareCardInput: Sendable {
    var layout: ShareCardLayout
    /// The shared link (its code is on the card).
    var url: String
    var subject: String = ""
    /// Name on the TappyAI QR card: the profile's name, or the post's title.
    var displayName: String? = nil
    var post: SharePostCard? = nil
    var plan: PlanCardData? = nil
    var places: [SharedPlace] = []
    var lang: String
}

/// Loads a remote photo for a card: https only, time-boxed, and never a reason for a card to fail —
/// a photo that does not arrive is simply not drawn. (DEBUG also accepts the CI fixture server.)
enum CardImageLoader {
    static func load(_ urlString: String?, timeout: TimeInterval = 5) async -> UIImage? {
        guard let s = urlString, let url = URL(string: s), allowed(url) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? false else { return nil }
        return UIImage(data: data)
    }

    private static func allowed(_ url: URL) -> Bool {
        if url.scheme == "https" { return true }
        #if DEBUG
        return url.scheme == "http" && (url.host == "127.0.0.1" || url.host == "localhost")
        #else
        return false
        #endif
    }

    /// Loads several at once; the result is keyed by the URL string.
    static func loadAll(_ urls: [String]) async -> [String: UIImage] {
        var out: [String: UIImage] = [:]
        await withTaskGroup(of: (String, UIImage?).self) { group in
            for u in Set(urls) { group.addTask { (u, await load(u)) } }
            for await (u, img) in group { if let img { out[u] = img } }
        }
        return out
    }
}

@MainActor
final class ShareCardFiles {
    struct Card {
        let layout: ShareCardLayout
        let image: UIImage
        let fileURL: URL
    }

    private var cache: [String: Card] = [:]

    /// `nonisolated` so a SwiftUI view can hold one as a plain property.
    nonisolated init() {}

    /// The card for `input`, rendered once per (layout, link, subject). Nil if rendering failed
    /// (not cached: the next ask retries).
    func card(_ input: ShareCardInput) async -> Card? {
        let key = "\(input.layout.rawValue)|\(input.url)|\(input.subject)|\(input.lang)"
        if let hit = cache[key] { return hit }
        guard let card = await render(input) else { return nil }
        cache[key] = card
        return card
    }

    private func render(_ input: ShareCardInput) async -> Card? {
        let lang = input.lang
        let image: UIImage?
        switch input.layout {
        case .profile, .post:
            let post = input.layout == .post
            let view = BrandedQrCardView(
                text: input.url,
                displayName: input.displayName ?? "",
                caption: CardCopy.string(post ? "share.card.postScanHint" : "share.card.profileScanHint", lang: lang),
                invite: post ? nil : CardCopy.string("share.card.invite", lang: lang),
                tagline: CardCopy.string("share.card.tagline", lang: lang),
                slogan: CardCopy.string("share.card.slogan", lang: lang),
                sloganSub: CardCopy.string("share.card.sloganSub", lang: lang),
                websiteLabel: CardCopy.string("share.card.websiteLabel", lang: lang),
                features: (1...4).map { CardCopy.string("share.card.feat\($0)", lang: lang) },
                website: CardCopy.website())
            image = Self.rasterise(view, width: 1200, height: nil)
        case .review, .clip:
            guard let post = input.post else { return nil }
            let images = await CardImageLoader.loadAll([post.image].compactMap { $0 })
            let copy = ContentCardCopy.make(badgeKey: input.layout == .clip ? "share.card.badgeClip" : "share.card.badgeReview", lang: lang)
            image = Self.rasterise(PostCardView(card: post, url: input.url, copy: copy, images: images), width: 1080, height: 1920)
        case .suggestion:
            guard !input.places.isEmpty else { return nil }
            let shown = input.places.prefix(SuggestionCardView.maxRows)
            let images = await CardImageLoader.loadAll(shown.compactMap { $0.image })
            let copy = ContentCardCopy.make(badgeKey: "share.card.badgeSuggestion", lang: lang)
            image = Self.rasterise(SuggestionCardView(subject: input.subject, places: input.places, url: input.url, copy: copy, images: images),
                                   width: 1080, height: 1920)
        case .plan:
            guard let plan = input.plan else { return nil }
            var photos = plan.highlights.map(\.photo)
            for d in plan.days.prefix(PlanCardData.cardDays) {
                photos += d.items.prefix(PlanCardData.cardStops).compactMap(\.photoUrl)
            }
            let images = await CardImageLoader.loadAll(photos)
            image = Self.rasterise(PlanCardView(data: plan, url: input.url, strings: PlanCardStrings.of(lang), images: images),
                                   width: 1080, height: nil)
        }
        guard let image, let data = image.pngData() else { return nil }
        // One file per (layout, link): the name says which layout made it, a folder keeps two links apart.
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("share-cards", isDirectory: true)
            .appendingPathComponent(String(UInt(bitPattern: "\(input.layout.rawValue)|\(input.url)".hashValue)), isDirectory: true)
        guard (try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)) != nil else { return nil }
        let file = dir.appendingPathComponent(input.layout.fileName())
        guard (try? data.write(to: file, options: .atomic)) != nil else { return nil }
        return Card(layout: input.layout, image: image, fileURL: file)
    }

    /// Renders at 1 pt = 1 px (the cards are drawn in output pixels).
    static func rasterise<V: View>(_ view: V, width: CGFloat, height: CGFloat?) -> UIImage? {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        renderer.isOpaque = true
        renderer.proposedSize = ProposedViewSize(width: width, height: height)
        return renderer.uiImage
    }
}
