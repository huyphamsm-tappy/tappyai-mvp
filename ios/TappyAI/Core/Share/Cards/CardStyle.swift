import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins

/// ONE STYLE for every TappyAI share image — port of web `src/lib/share/cardStyle.ts` and Android
/// `CardStyle.kt` (owner picks 29/09, `docs/design/share-layouts/README.md`). Light cards (profile
/// QR, review, Explore clip, suggestion) follow sample #1; the plan card follows sample #7. Every
/// colour and size is a token here so no card drifts into its own palette.
///
/// Cards are laid out in POINTS at the rendered scale (1 pt = 1 px, `ImageRenderer.scale = 1`), on a
/// 1080-wide frame. Fixed-size fonts (`.system(size:)`) do not follow Dynamic Type, so a card looks
/// the same for every user.
enum CardLight {
    static let ink = Color(hex: 0x0B1B3F)
    static let body = Color(hex: 0x33415C)
    static let muted = Color(hex: 0x4F5B76)
    static let blue = Color(hex: 0x1E6BFF)
    static let brandBlue = Color(hex: 0x3391FF)
    static let sky = Color(hex: 0xEAF3FF)
    static let groundTop = Color(hex: 0xFFFFFF)
    static let groundMid = Color(hex: 0xF2F7FF)
    static let panel = Color.white
    static let panelBorder = Color(hex: 0xD8E4FA)
    static let pillBorder = Color(hex: 0xB9D2FB)
    static let bannerFrom = Color(hex: 0x1453D9)
    static let bannerTo = Color(hex: 0x2F8CFF)
    static let bannerSub = Color(hex: 0xE3EEFF)
    static let star = Color(hex: 0xFFB020)
    static let starOff = Color(hex: 0xD5DEEE)
}

enum CardDark {
    static let ground = Color(hex: 0x0B1220)
    static let groundDeep = Color(hex: 0x070A12)
    static let groundEnd = Color(hex: 0x14133A)
    static let panel = Color(hex: 0x111A2E)
    static let panelBorder = Color.white.opacity(0.08)
    static let text = Color(hex: 0xF4F6FB)
    static let muted = Color(hex: 0xF4F6FB, alpha: 0.70)
    static let faint = Color(hex: 0xF4F6FB, alpha: 0.50)
    static let eyebrow = Color(hex: 0x8FB8FF)
    static let accentFrom = Color(hex: 0x3B82F6)
    static let accentTo = Color(hex: 0x8B5CF6)
    static let pin = Color(hex: 0xA78BFA)
}

enum CardSize {
    static let width: CGFloat = 1080
    static let height: CGFloat = 1920
    static let pad: CGFloat = 60
    static let panelRadius: CGFloat = 40
    static let photoRadius: CGFloat = 28
    static let markSize: CGFloat = 116
    static let wordmarkPx: CGFloat = 54
    static let taglinePx: CGFloat = 26
    static let bracket: CGFloat = 40
    static let bracketStroke: CGFloat = 7
    static let bannerH: CGFloat = 170
    static let mascotH: CGFloat = 300
}

// MARK: - Shapes

/// A five-point star inscribed in its rect (inner radius 45%).
struct CardStar: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        for i in 0..<10 {
            let rad = i % 2 == 0 ? r : r * 0.45
            let a = -Double.pi / 2 + Double(i) * Double.pi / 5
            let pt = CGPoint(x: c.x + rad * CGFloat(cos(a)), y: c.y + rad * CGFloat(sin(a)))
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        p.closeSubpath()
        return p
    }
}

/// A map-pin glyph with a white dot.
struct CardPin: View {
    let size: CGFloat
    let color: Color
    var body: some View {
        Image(systemName: "mappin")
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(color)
            .frame(width: size, height: size)
    }
}

struct CardStars: View {
    let rating: Int
    let size: CGFloat
    var body: some View {
        HStack(spacing: size * 0.3) {
            ForEach(0..<5, id: \.self) { i in
                CardStar().fill(i < rating ? CardLight.star : CardLight.starOff).frame(width: size, height: size)
            }
        }
    }
}

// MARK: - Light frame parts

struct CardLightGround: View {
    var body: some View {
        LinearGradient(stops: [
            .init(color: CardLight.groundTop, location: 0),
            .init(color: CardLight.groundMid, location: 0.55),
            .init(color: CardLight.sky, location: 1),
        ], startPoint: .top, endPoint: .bottom)
    }
}

/// The lockup: round otter mark over the wordmark ("Tappy" ink, "AI" brand blue), centred.
struct CardLockup: View {
    let tagline: String?
    var body: some View {
        VStack(spacing: 10) {
            Image("OtterMark").resizable().scaledToFill()
                .frame(width: CardSize.markSize, height: CardSize.markSize)
                .clipShape(Circle())
            (Text("Tappy").foregroundColor(CardLight.ink) + Text("AI").foregroundColor(CardLight.brandBlue))
                .font(.system(size: CardSize.wordmarkPx, weight: .heavy))
            if let t = tagline?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty {
                Text(t).font(.system(size: CardSize.taglinePx, weight: .medium))
                    .foregroundStyle(CardLight.muted)
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .padding(.top, 4)
            }
        }
        .frame(width: CardSize.width - CardSize.pad * 2)
    }
}

/// The blue slogan band with the hoodie otter standing over its left end.
struct CardBanner: View {
    let slogan: String
    let sub: String?
    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: CardSize.panelRadius, style: .continuous)
                .fill(LinearGradient(colors: [CardLight.bannerFrom, CardLight.bannerTo], startPoint: .leading, endPoint: .trailing))
                .frame(height: CardSize.bannerH)
            VStack(spacing: 8) {
                Text(slogan).font(.system(size: 40, weight: .heavy)).italic().foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.5)
                if let sub, !sub.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text(sub).font(.system(size: 24, weight: .medium)).foregroundStyle(CardLight.bannerSub)
                        .lineLimit(1).minimumScaleFactor(0.5)
                }
            }
            .frame(width: (CardSize.width - CardSize.pad * 2) * 0.6, height: CardSize.bannerH)
            .offset(x: (CardSize.width - CardSize.pad * 2) * 0.33)
            Image("OtterMascot").resizable().scaledToFit()
                .frame(height: CardSize.mascotH)
                .offset(x: 20, y: CardSize.bannerH - CardSize.mascotH + 6)
        }
        .frame(width: CardSize.width - CardSize.pad * 2, height: CardSize.bannerH, alignment: .topLeading)
    }
}

/// The website pill (globe · host · arrow).
struct CardWebsitePill: View {
    let website: String
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "globe").font(.system(size: 30, weight: .medium)).foregroundStyle(CardLight.blue)
            Text(website).font(.system(size: 32, weight: .bold)).foregroundStyle(CardLight.blue)
                .lineLimit(1).minimumScaleFactor(0.5)
            Image(systemName: "arrow.right").font(.system(size: 26, weight: .semibold)).foregroundStyle(CardLight.blue)
        }
        .padding(.horizontal, 32)
        .frame(height: 76)
        .background(Capsule().fill(CardLight.sky))
        .overlay(Capsule().stroke(CardLight.pillBorder, lineWidth: 2))
    }
}

// MARK: - QR

enum CardQR {
    /// The QR of `text` (byte mode, error correction M — as web `encodeQR`) as a crisp bitmap, one
    /// pixel per module, or nil if it cannot be encoded.
    static func image(for text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let cg = context.createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// A scannable code: white square, quiet zone all round, blue brackets OUTSIDE the quiet zone.
struct CardQRBlock: View {
    let text: String
    let side: CGFloat
    var body: some View {
        ZStack {
            Rectangle().fill(Color.white)
            if let qr = CardQR.image(for: text) {
                Image(uiImage: qr).interpolation(.none).resizable()
                    .padding(side * 0.09)   // ≥ 4 modules of quiet zone at the sizes used
            }
        }
        .frame(width: side, height: side)
        .overlay(CardBrackets().stroke(CardLight.blue, style: StrokeStyle(lineWidth: CardSize.bracketStroke, lineCap: .round, lineJoin: .round))
            .padding(-12))
    }
}

struct CardBrackets: Shape {
    var length: CGFloat = CardSize.bracket
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let l = length
        p.move(to: CGPoint(x: rect.minX, y: rect.minY + l)); p.addLine(to: CGPoint(x: rect.minX, y: rect.minY)); p.addLine(to: CGPoint(x: rect.minX + l, y: rect.minY))
        p.move(to: CGPoint(x: rect.maxX - l, y: rect.minY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + l))
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY - l)); p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY)); p.addLine(to: CGPoint(x: rect.minX + l, y: rect.maxY))
        p.move(to: CGPoint(x: rect.maxX - l, y: rect.maxY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - l))
        return p
    }
}

/// Cover-fit a photo into a rounded box (a missing photo draws `fallback`).
struct CardPhoto<Fallback: View>: View {
    let image: UIImage?
    let width: CGFloat
    let height: CGFloat
    let radius: CGFloat
    @ViewBuilder var fallback: () -> Fallback
    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
                    .frame(width: width, height: height).clipped()
            } else {
                fallback()
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// Card copy in the CARD's language (the app's chosen language), not the device's:
/// `String(localized:)` resolves the device language, so look the key up in that language's lproj.
enum CardCopy {
    static func string(_ key: String, lang: String) -> String {
        let code = lang.lowercased().hasPrefix("en") ? "en" : "vi"
        let bundle = Bundle.main.path(forResource: code, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        return bundle.localizedString(forKey: key, value: nil, table: nil)
    }

    static func website(from origin: String = TappyShare.canonicalOrigin) -> String {
        URL(string: origin)?.host ?? "www.tappyai.com"
    }
}
