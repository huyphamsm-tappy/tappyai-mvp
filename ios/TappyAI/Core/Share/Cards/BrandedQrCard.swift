import SwiftUI

/// The TappyAI QR card (profile QR, and the "Mã QR" layout of an Explore post) — port of web
/// `src/lib/qr/brandedCard.ts` and Android `BrandedQrCard.kt` (sample #1). Lockup + tagline, the
/// code with its full quiet zone and blue brackets OUTSIDE it, name + caption, the slogan banner
/// with the hoodie otter, the website panel, and the feature strip. Nothing is drawn inside the code.
///
/// No Google Play badge on iOS: Android/web show one (owner SL2 29/09), but an iPhone user cannot
/// use it and Apple's review does not welcome another store's badge — and there is no App Store
/// listing yet to show instead (no badge and no "coming soon" box, same rule as the web card).
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
