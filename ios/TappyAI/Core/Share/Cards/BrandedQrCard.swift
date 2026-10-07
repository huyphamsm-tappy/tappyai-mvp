import SwiftUI

/// The TappyAI QR card (profile QR, and the "Mã QR" layout of an Explore post) — port of web
/// `src/lib/qr/brandedCard.ts` and Android `BrandedQrCard.kt` (sample #1). Lockup + tagline, the
/// code with its full quiet zone and blue brackets OUTSIDE it, name + caption, the slogan banner
/// with the hoodie otter, the website panel, and the feature strip. Nothing is drawn inside the code.
///
/// No Google Play badge on iOS (an iPhone user cannot use it and Apple's review does not welcome another store's badge). Like the
/// Web card while no store listing is public (Phase 7), the bottom panel names both apps: «Android · Sắp có…» and «iOS · Sắp có…»,
/// each with its platform chip (green Android robot head / black Apple mark, `PlatformLogo`, Web `drawPlatformLogo`), then «Hoặc truy cập website» (`apps`).
struct BrandedQrCardView: View {
    let text: String
    let displayName: String
    let caption: String
    let invite: String?
    let tagline: String?
    let slogan: String?
    let sloganSub: String?
    let websiteLabel: String?
    let features: [String]
    let website: String?
    /// Web `brandedCard.ts` `apps` (Phase 7, no store listing public yet): «Tải ứng dụng TappyAI» with Android and iOS each on its own line
    /// («Sắp có»), then «Hoặc truy cập website». Nil keeps the single-column website panel.
    var apps: AppsComingSoon? = nil

    struct AppsComingSoon {
        let title: String
        let android: String
        let ios: String
        let orWebsite: String
    }

    private let width: CGFloat = 1200
    private let pad: CGFloat = 60
    private let qrSide: CGFloat = 780

    var body: some View {
        VStack(spacing: 0) {
            // Lockup
            VStack(spacing: 16) {
                Image("OtterMark").resizable().scaledToFill().frame(width: 150, height: 150).clipShape(Circle())
                (Text("Tappy").foregroundColor(CardLight.ink) + Text("AI").foregroundColor(CardLight.brandBlue))
                    .font(.system(size: 64, weight: .heavy))
                if let tagline, !tagline.isEmpty {
                    Text(tagline).font(.system(size: 28, weight: .medium)).foregroundStyle(CardLight.muted)
                        .lineLimit(1).minimumScaleFactor(0.6).padding(.top, 2)
                }
            }
            .padding(.top, pad)

            CardQRBlock(text: text, side: qrSide).padding(.top, 60)

            if !displayName.trimmingCharacters(in: .whitespaces).isEmpty {
                Text(displayName.trimmingCharacters(in: .whitespaces))
                    .font(.system(size: 58, weight: .heavy)).foregroundStyle(CardLight.ink)
                    .lineLimit(1).minimumScaleFactor(0.5).padding(.top, 40).padding(.horizontal, pad)
            }
            Text(caption).font(.system(size: 29, weight: .medium)).foregroundStyle(CardLight.muted)
                .lineLimit(1).minimumScaleFactor(0.6).padding(.top, 18).padding(.horizontal, pad)
            if let invite, !invite.isEmpty {
                Text(invite).font(.system(size: 29, weight: .medium)).foregroundStyle(CardLight.muted)
                    .lineLimit(1).minimumScaleFactor(0.6).padding(.top, 10).padding(.horizontal, pad)
            }

            if let slogan, !slogan.isEmpty {
                CardBanner(slogan: slogan, sub: sloganSub, width: width - pad * 2)
                    .padding(.top, 150)
            }

            if let website, !website.isEmpty { websitePanel(website).padding(.top, 36) }

            if !features.isEmpty { featureStrip.padding(.top, 30) }
            Spacer().frame(height: pad)
        }
        .frame(width: width)
        .background(CardLightGround())
        .environment(\.colorScheme, .light)
    }

    private func websitePanel(_ website: String) -> some View {
        if let apps { return AnyView(appsPanel(apps, website)) }
        return AnyView(plainWebsitePanel(website))
    }

    /// Two columns, as the Web card: the apps on the left (platform chip per system), a divider, the website on the right.
    private func appsPanel(_ apps: AppsComingSoon, _ website: String) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                Text(apps.title).font(.system(size: 32, weight: .heavy)).foregroundStyle(CardLight.ink)
                    .lineLimit(1).minimumScaleFactor(0.6)
                ForEach(Array([apps.android, apps.ios].enumerated()), id: \.offset) { i, line in
                    HStack(spacing: PlatformLogo.textGap) {
                        PlatformLogo(kind: i == 0 ? .android : .apple).accessibilityHidden(true)
                        Text(line).font(.system(size: 25, weight: .semibold)).foregroundStyle(CardLight.muted)
                            .lineLimit(2).minimumScaleFactor(0.6)
                    }
                }
            }
            .padding(.horizontal, 40)
            .frame(width: (width - pad * 2) * 0.52, alignment: .leading)

            Rectangle().fill(CardLight.panelBorder).frame(width: 2).padding(.vertical, 36)

            VStack(spacing: 20) {
                Text(apps.orWebsite).font(.system(size: 27, weight: .semibold)).foregroundStyle(CardLight.ink)
                    .lineLimit(1).minimumScaleFactor(0.6)
                CardWebsitePill(website: website)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity)
        }
        .frame(width: width - pad * 2, height: 250)
        .background(RoundedRectangle(cornerRadius: 32, style: .continuous).fill(Color.white))
        .overlay(RoundedRectangle(cornerRadius: 32, style: .continuous).stroke(CardLight.panelBorder, lineWidth: 2))
    }

    private func plainWebsitePanel(_ website: String) -> some View {
        VStack(spacing: 20) {
            if let label = websiteLabel, !label.isEmpty {
                Text(label).font(.system(size: 27, weight: .semibold)).foregroundStyle(CardLight.ink)
            }
            CardWebsitePill(website: website)
        }
        .frame(width: width - pad * 2, height: 190)
        .background(RoundedRectangle(cornerRadius: 32, style: .continuous).fill(Color.white))
        .overlay(RoundedRectangle(cornerRadius: 32, style: .continuous).stroke(CardLight.panelBorder, lineWidth: 2))
    }

    private var featureStrip: some View {
        let icons = ["bubble.left", "mappin.and.ellipse", "person.2", "heart"]
        return HStack(spacing: 24) {
            ForEach(Array(features.prefix(4).enumerated()), id: \.offset) { i, label in
                HStack(spacing: 10) {
                    Image(systemName: icons[i % icons.count]).font(.system(size: 26, weight: .medium))
                        .foregroundStyle(i == 3 ? Color(hex: 0xF0457A) : CardLight.blue)
                    Text(label).font(.system(size: 21, weight: .medium)).foregroundStyle(CardLight.muted)
                        .lineLimit(1).minimumScaleFactor(0.5)
                }
            }
        }
        .frame(width: width - pad * 2)
    }
}

// MARK: - Platform logo chips (Web `brandedCard.ts` `drawPlatformLogo`, `STORE_LOGO = 46`)

/// Original hand-drawn platform marks: a green chip with the robot head for Android, a black chip with the apple for iOS.
/// Same size and corner radius so the two rows read as a balanced pair. Coordinates are Web's canvas fractions of the chip side.
struct PlatformLogo: View {
    enum Kind { case android, apple }
    let kind: Kind

    /// Web `STORE_LOGO` (46) and the text gap (`x + STORE_LOGO + 18`).
    static let side: CGFloat = 46
    static let textGap: CGFloat = 18
    static let cornerFraction: CGFloat = 0.24
    static let androidGreen: UInt = 0x3DDC84
    static let androidInk: UInt = 0x0B3D22
    static let appleBlack: UInt = 0x111111

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: Self.side * Self.cornerFraction, style: .continuous)
                .fill(Color(hex: kind == .android ? Self.androidGreen : Self.appleBlack))
            switch kind {
            case .android:
                AndroidRobotHead().fill(Color(hex: Self.androidInk))
                AndroidRobotAntennae()
                    .stroke(Color(hex: Self.androidInk), style: StrokeStyle(lineWidth: max(2, Self.side * 0.05), lineCap: .round))
                AndroidRobotEyes().fill(Color(hex: Self.androidGreen))
            case .apple:
                Image(systemName: "applelogo")
                    .font(.system(size: Self.side * 0.56, weight: .regular))
                    .foregroundStyle(Color.white)
            }
        }
        .frame(width: Self.side, height: Self.side)
    }
}

/// Dome: half-disc of radius 0.28 centred at (0.5, 0.64), flat side down.
struct AndroidRobotHead: Shape {
    func path(in rect: CGRect) -> Path {
        let s = rect.width
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + 0.22 * s, y: rect.minY + 0.64 * s))
        p.addArc(center: CGPoint(x: rect.minX + 0.5 * s, y: rect.minY + 0.64 * s), radius: 0.28 * s,
                 startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
        p.closeSubpath()
        return p
    }
}

struct AndroidRobotAntennae: Shape {
    func path(in rect: CGRect) -> Path {
        let s = rect.width
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * s, y: rect.minY + y * s) }
        var p = Path()
        p.move(to: pt(0.34, 0.4)); p.addLine(to: pt(0.27, 0.27))
        p.move(to: pt(0.66, 0.4)); p.addLine(to: pt(0.73, 0.27))
        return p
    }
}

struct AndroidRobotEyes: Shape {
    func path(in rect: CGRect) -> Path {
        let s = rect.width
        var p = Path()
        for ex in [CGFloat(0.38), CGFloat(0.62)] {
            let r = 0.04 * s
            p.addEllipse(in: CGRect(x: rect.minX + ex * s - r, y: rect.minY + 0.54 * s - r, width: 2 * r, height: 2 * r))
        }
        return p
    }
}
