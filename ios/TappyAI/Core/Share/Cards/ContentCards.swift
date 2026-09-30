import SwiftUI

/// The REVIEW, Explore CLIP and SUGGESTION share cards — port of web `src/lib/share/contentCards.ts`
/// and Android `ContentCards.kt` (sample #1's light style, 1080×1920). Each card: the lockup at the
/// top, the content on a white rounded panel, a scannable code of the shared link with the website
/// pill, and the blue slogan banner with the hoodie otter at the foot.
///
/// 🚨 WHAT A CARD MAY SHOW. Only fields the share already carries: a post's own public fields and a
/// suggestion's whitelisted `SharedPlace` fields (never distance). A missing field is not drawn.
struct SharePostCard: Equatable, Sendable {
    enum Kind: Equatable, Sendable { case review, clip }
    let kind: Kind
    let title: String
    /// A real venue (never the composer's "Chia sẻ" sentinel).
    var placeName: String? = nil
    var address: String? = nil
    /// 1–5, reviews with a real place only.
    var rating: Int? = nil
    var excerpt: String? = nil
    var author: String? = nil
    /// First photo (review) or the clip's thumbnail.
    var image: String? = nil

    static let excerptMax = 220
    private static let titleMax = 80

    /// Web `reviewShareTitle`: the real place → the caption's first line (≤ 80) → the brand.
    static func shareTitle(placeName: String?, body: String?) -> String {
        let place = (placeName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !place.isEmpty, place != "Chia sẻ", place != "Chia se" { return place }
        let line = (body ?? "").components(separatedBy: "\n")
            .map { $0.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
            .first(where: { !$0.isEmpty }) ?? ""
        if !line.isEmpty {
            return line.count > titleMax ? String(line.prefix(titleMax - 1)).trimmingCharacters(in: .whitespaces) + "…" : line
        }
        return "TappyAI"
    }

    /// Web `postCardOf`, the ONE mapping from a feed/detail review.
    init(review: Review) {
        let isClip = review.contentType == "video"
        let realPlace = !review.isShareOnly
        let body = (review.body ?? "").split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let excerptText = body.count > Self.excerptMax
            ? String(body.prefix(Self.excerptMax - 1)).trimmingCharacters(in: .whitespaces) + "…" : body
        func https(_ s: String?) -> String? {
            guard let s, s.lowercased().hasPrefix("https://") else { return nil }
            return s
        }
        let firstPhoto = review.photos?.compactMap(https).first
        let thumb = https(review.thumbnail)
        let title = Self.shareTitle(placeName: review.placeName, body: review.body)
        kind = isClip ? .clip : .review
        self.title = title
        placeName = realPlace ? review.placeName?.trimmingCharacters(in: .whitespaces) : nil
        address = realPlace ? review.placeAddress?.trimmingCharacters(in: .whitespaces).nilIfEmpty : nil
        rating = (!isClip && realPlace) ? review.rating.flatMap { (1...5).contains(Int($0)) ? Int($0) : nil } : nil
        // The title already IS the caption when there is no place: do not print it twice.
        excerpt = (!excerptText.isEmpty && (realPlace || excerptText != title)) ? excerptText : nil
        author = review.profiles?.fullName?.trimmingCharacters(in: .whitespaces).nilIfEmpty
        image = isClip ? (thumb ?? firstPhoto) : (firstPhoto ?? thumb)
    }

    init(kind: Kind, title: String, placeName: String? = nil, address: String? = nil, rating: Int? = nil,
         excerpt: String? = nil, author: String? = nil, image: String? = nil) {
        self.kind = kind; self.title = title; self.placeName = placeName; self.address = address
        self.rating = rating; self.excerpt = excerpt; self.author = author; self.image = image
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// The words on a light content card (already localised for the card's language).
struct ContentCardCopy: Sendable {
    var tagline: String?
    var badge: String
    var scanTitle: String
    var slogan: String?
    var sloganSub: String?
    var website: String
    /// "Đăng bởi {name}".
    var byline: String?
    /// "+{n} địa điểm khác".
    var morePlaces: String?

    static func make(badgeKey: String, lang: String) -> ContentCardCopy {
        ContentCardCopy(
            tagline: CardCopy.string("share.card.tagline", lang: lang),
            badge: CardCopy.string(badgeKey, lang: lang),
            scanTitle: CardCopy.string("share.card.scan", lang: lang),
            slogan: CardCopy.string("share.card.slogan", lang: lang),
            sloganSub: CardCopy.string("share.card.sloganSub", lang: lang),
            website: CardCopy.website(),
            byline: CardCopy.string("share.card.byline", lang: lang),
            morePlaces: CardCopy.string("share.card.morePlaces", lang: lang))
    }
}

/// Vertical plan (px) — every content card is the same frame.
enum ContentFrame {
    static let lockupTop: CGFloat = 56
    static let panelTop: CGFloat = 330
    static let panelBottom: CGFloat = 1330
    static let qrRowTop: CGFloat = 1360
    static let qrRowH: CGFloat = 260
    static let bannerTop: CGFloat = 1690
}

/// The shared frame of a light content card; `content` is drawn inside the white panel (its
/// origin is the panel's top-left, size `panelWidth × panelHeight`).
struct LightCardFrame<Content: View>: View {
    let url: String
    let copy: ContentCardCopy
    @ViewBuilder var content: () -> Content

    static var panelWidth: CGFloat { CardSize.width - CardSize.pad * 2 }
    static var panelHeight: CGFloat { ContentFrame.panelBottom - ContentFrame.panelTop }

    var body: some View {
        let qrSide: CGFloat = 212
        let colW = Self.panelWidth - 28 - qrSide - 44 - 40
        ZStack(alignment: .topLeading) {
            CardLightGround()
            CardLockup(tagline: copy.tagline)
                .offset(x: CardSize.pad, y: ContentFrame.lockupTop)

            // Content panel with a soft blue shadow.
            RoundedRectangle(cornerRadius: CardSize.panelRadius, style: .continuous)
                .fill(CardLight.panel)
                .shadow(color: Color(hex: 0x1E6BFF, alpha: 0.10), radius: 15, x: 0, y: 8)
                .overlay(RoundedRectangle(cornerRadius: CardSize.panelRadius, style: .continuous)
                    .stroke(CardLight.panelBorder, lineWidth: 2))
                .frame(width: Self.panelWidth, height: Self.panelHeight)
                .offset(x: CardSize.pad, y: ContentFrame.panelTop)
            content()
                .frame(width: Self.panelWidth, height: Self.panelHeight, alignment: .topLeading)
                .clipShape(RoundedRectangle(cornerRadius: CardSize.panelRadius, style: .continuous))
                .offset(x: CardSize.pad, y: ContentFrame.panelTop)

            // Code row: the code of the SHARED LINK, on the right (the banner otter stands on the left).
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .fill(CardLight.panel)
                .overlay(RoundedRectangle(cornerRadius: 32, style: .continuous).stroke(CardLight.panelBorder, lineWidth: 2))
                .frame(width: Self.panelWidth, height: ContentFrame.qrRowH)
                .offset(x: CardSize.pad, y: ContentFrame.qrRowTop)
            VStack(spacing: 24) {
                Text(copy.scanTitle).font(.system(size: 32, weight: .heavy)).foregroundStyle(CardLight.ink)
                    .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.7)
                    .frame(width: colW)
                CardWebsitePill(website: copy.website).frame(maxWidth: colW)
            }
            .frame(width: colW, height: ContentFrame.qrRowH)
            .offset(x: CardSize.pad + 40, y: ContentFrame.qrRowTop)
            CardQRBlock(text: url, side: qrSide)
                .offset(x: CardSize.width - CardSize.pad - 28 - qrSide,
                        y: ContentFrame.qrRowTop + (ContentFrame.qrRowH - qrSide) / 2)

            if let slogan = copy.slogan?.trimmingCharacters(in: .whitespaces), !slogan.isEmpty {
                CardBanner(slogan: slogan, sub: copy.sloganSub)
                    .offset(x: CardSize.pad, y: ContentFrame.bannerTop)
            }
        }
        .frame(width: CardSize.width, height: CardSize.height, alignment: .topLeading)
        .environment(\.colorScheme, .light)
    }
}

/// The small "REVIEW / CLIP / TAPPY GỢI Ý" badge on the media.
struct CardBadge: View {
    enum Glyph { case star, play, spark }
    let label: String
    let glyph: Glyph
    var body: some View {
        HStack(spacing: 12) {
            switch glyph {
            case .star: CardStar().fill(CardLight.star).frame(width: 28, height: 28)
            case .spark: CardStar().fill(CardLight.blue).frame(width: 28, height: 28)
            case .play: Image(systemName: "play.fill").font(.system(size: 22)).foregroundStyle(CardLight.blue)
            }
            Text(label.uppercased()).font(.system(size: 26, weight: .heavy)).foregroundStyle(CardLight.blue)
        }
        .padding(.horizontal, 24)
        .frame(height: 52)
        .background(Capsule().fill(Color.white.opacity(0.94)))
        .overlay(Capsule().stroke(CardLight.pillBorder, lineWidth: 2))
    }
}

// MARK: - Review / clip card

struct PostCardView: View {
    let card: SharePostCard
    let url: String
    let copy: ContentCardCopy
    let images: [String: UIImage]

    var body: some View {
        LightCardFrame(url: url, copy: copy) {
            let isClip = card.kind == .clip
            let mw = LightCardFrame<EmptyView>.panelWidth - 60
            let mh: CGFloat = isClip ? 560 : 480
            ZStack(alignment: .topLeading) {
                CardPhoto(image: card.image.flatMap { images[$0] }, width: mw, height: mh, radius: CardSize.photoRadius) {
                    if isClip {
                        LinearGradient(colors: [CardLight.bannerFrom, CardLight.bannerTo], startPoint: .topLeading, endPoint: .bottomTrailing)
                    } else {
                        ZStack {
                            LinearGradient(colors: [Color(hex: 0xDCEBFF), CardLight.sky], startPoint: .topLeading, endPoint: .bottomTrailing)
                            Text("“").font(.system(size: 220, weight: .heavy, design: .serif))
                                .foregroundStyle(Color(hex: 0x1E6BFF, alpha: 0.25))
                        }
                    }
                }
                if isClip {
                    // The play button: this card stands for a video.
                    ZStack {
                        Circle().fill(Color.white.opacity(0.92)).frame(width: 132, height: 132)
                        Image(systemName: "play.fill").font(.system(size: 60)).foregroundStyle(CardLight.blue).offset(x: 6)
                    }
                    .frame(width: mw, height: mh)
                }
                CardBadge(label: copy.badge, glyph: isClip ? .play : .star).offset(x: 20, y: 20)
            }
            .offset(x: 30, y: 30)
            postText(top: 30 + mh + 6)
        }
    }

    /// Title, stars, place, excerpt, byline — below the media, inside the panel.
    private func postText(top: CGFloat) -> some View {
        let w = LightCardFrame<EmptyView>.panelWidth - 68
        let placeLine = card.address ?? card.placeName.flatMap { $0 != card.title ? $0 : nil }
        return VStack(alignment: .leading, spacing: 16) {
            Text(card.title).font(.system(size: 46, weight: .heavy)).foregroundStyle(CardLight.ink)
                .lineLimit(2).minimumScaleFactor(0.7)
            if let rating = card.rating {
                HStack(spacing: 12) {
                    CardStars(rating: rating, size: 38)
                    Text("\(rating)/5").font(.system(size: 28, weight: .bold)).foregroundStyle(CardLight.muted)
                }
            }
            if let placeLine, !placeLine.isEmpty {
                HStack(spacing: 10) {
                    CardPin(size: 28, color: CardLight.blue)
                    Text(placeLine).font(.system(size: 26, weight: .medium)).foregroundStyle(CardLight.muted).lineLimit(1)
                }
            }
            if let ex = card.excerpt {
                Text("“\(ex)”").font(.system(size: 29, weight: .medium)).foregroundStyle(CardLight.body)
                    .lineLimit(5).lineSpacing(6)
            }
            Spacer(minLength: 0)
            if let author = card.author, let byline = copy.byline {
                HStack(spacing: 12) {
                    Text(String(author.prefix(1)).uppercased()).font(.system(size: 22, weight: .heavy))
                        .foregroundStyle(CardLight.blue)
                        .frame(width: 40, height: 40).background(Circle().fill(CardLight.sky))
                    Text(byline.replacingOccurrences(of: "{name}", with: author))
                        .font(.system(size: 25, weight: .semibold)).foregroundStyle(CardLight.muted).lineLimit(1)
                }
            }
        }
        .frame(width: w, height: LightCardFrame<EmptyView>.panelHeight - top - 30, alignment: .topLeading)
        .offset(x: 34, y: top)
    }
}

// MARK: - Suggestion card

struct SuggestionCardView: View {
    let subject: String
    let places: [SharedPlace]
    let url: String
    let copy: ContentCardCopy
    let images: [String: UIImage]

    /// Owner verdict 29/09 (web b16b52d): "lấy tấm 1 và 2" — the first TWO places; the rest go in the "+N" line.
    static let maxRows = 2

    var body: some View {
        LightCardFrame(url: url, copy: copy) {
            let x: CGFloat = 34
            let w = LightCardFrame<EmptyView>.panelWidth - 68
            let shown = Array(places.prefix(Self.maxRows))
            let rowH: CGFloat = shown.isEmpty ? 176 : max(176, min(330, 640 / CGFloat(shown.count)))
            let thumb = min(260, rowH - 40)
            VStack(alignment: .leading, spacing: 0) {
                CardBadge(label: copy.badge, glyph: .spark)
                Text(subject).font(.system(size: 42, weight: .heavy)).foregroundStyle(CardLight.ink)
                    .lineLimit(2).minimumScaleFactor(0.7).padding(.top, 14)
                    .frame(width: w, alignment: .leading)
                VStack(spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.offset) { i, p in
                        HStack(alignment: .top, spacing: 26) {
                            CardPhoto(image: p.image.flatMap { images[$0] }, width: thumb, height: thumb, radius: 24) {
                                ZStack {
                                    CardLight.sky
                                    Text("\(i + 1)").font(.system(size: 56, weight: .heavy)).foregroundStyle(CardLight.blue)
                                }
                            }
                            placeText(i, p).frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(height: rowH, alignment: .top)
                        if i < shown.count - 1 {
                            Rectangle().fill(CardLight.panelBorder).frame(height: 2)
                        }
                    }
                }
                .padding(.top, 30)
                Spacer(minLength: 0)
                let more = places.count - shown.count
                if more > 0, let template = copy.morePlaces {
                    Text(template.replacingOccurrences(of: "{n}", with: String(more)))
                        .font(.system(size: 26, weight: .bold)).foregroundStyle(CardLight.blue)
                }
            }
            .frame(width: w, height: LightCardFrame<EmptyView>.panelHeight - 68, alignment: .topLeading)
            .offset(x: x, y: 34)
        }
    }

    private func placeText(_ i: Int, _ p: SharedPlace) -> some View {
        let meta = [p.category, p.priceRangeText].compactMap { $0 }.joined(separator: "  ·  ")
        return VStack(alignment: .leading, spacing: 10) {
            Text("\(i + 1). \(p.name)").font(.system(size: 32, weight: .heavy)).foregroundStyle(CardLight.ink)
                .lineLimit(1).minimumScaleFactor(0.6)
            HStack(spacing: 10) {
                if let rating = p.rating {
                    CardStar().fill(CardLight.star).frame(width: 28, height: 28)
                    Text(Self.number(rating) + (p.ratingCount.map { " (\($0))" } ?? ""))
                        .font(.system(size: 25, weight: .bold)).foregroundStyle(CardLight.ink)
                }
                if !meta.isEmpty {
                    Text(meta).font(.system(size: 25, weight: .medium)).foregroundStyle(CardLight.muted).lineLimit(1)
                }
            }
            if let addr = p.address, !addr.trimmingCharacters(in: .whitespaces).isEmpty {
                HStack(spacing: 8) {
                    CardPin(size: 24, color: CardLight.blue)
                    Text(addr).font(.system(size: 23, weight: .medium)).foregroundStyle(CardLight.muted).lineLimit(1)
                }
            }
        }
    }

    /// JS number printing: 4.5 → "4.5", 5.0 → "5".
    static func number(_ d: Double) -> String {
        d == d.rounded() ? String(Int(d)) : String(d)
    }
}
