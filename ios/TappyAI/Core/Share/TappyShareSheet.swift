import SwiftUI
import UIKit

/// The TappyAI share sheet for a recommendation or plan — the generalisation of
/// `ReviewShareSheet`, which stays as-is for reviews.
///
/// One `ShareArtifact` in; the preview at the top is rendered FROM it, so the user sees
/// exactly what leaves. Every target's feedback line says what actually happened —
/// "opened", "copied", "saved" — never "sent": this app does not know that.
///
/// What is genuinely direct on iOS:
///   · Viber — `viber://forward?text=` (documented) opens Viber with the brochure in it.
///   · LINE — `https://line.me/R/share?text=` (documented) opens LINE with the brochure in it.
///   · WhatsApp — `https://wa.me/?text=` (documented) opens WhatsApp with the brochure in it.
///   · Telegram — `https://t.me/share/url?url=&text=` (documented) opens Telegram with it.
///   · Mail — `mailto:` with subject + body.
///   · More apps — `UIActivityViewController` with text (+ image when rendered).
/// Zalo and Messenger document no text endpoint. For those the brochure is COPIED and the
/// app is opened (Messenger with the brand link), and the label says "Copy & open".
/// Facebook is the sharer dialog with the brand link, brochure on the clipboard — as on web.
struct TappyShareSheet: View {
    let artifact: ShareArtifact
    let lang: String
    let onDismiss: () -> Void

    @State private var image: UIImage? = nil
    @State private var feedback: String? = nil

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    preview

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.sm), count: 3), spacing: Spacing.sm) {
                        // The messaging apps, in the contract's order; the actions follow as rows.
                        ForEach(Array(TappyShare.targets.prefix { $0 != .inbox })) { t in
                            tile(t)
                        }
                    }

                    row(.inbox, system: "tray.and.arrow.down")
                    row(.save, system: "square.and.arrow.down")
                    row(.copy, system: "doc.on.doc")
                    row(.native, system: "square.and.arrow.up")

                    if let feedback {
                        Text(feedback)
                            .font(TappyFont.footnote)
                            .foregroundStyle(TappyColor.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, Spacing.xs)
                    }
                }
                .padding(Spacing.md)
            }
            .background(TappyColor.background)
            .navigationTitle(String(localized: "share.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common.close"), action: onDismiss)
                }
            }
        }
        .task(id: artifact.id) {
            // Rendered with the built-in ImageRenderer; a nil image never blocks any target.
            image = ShareCardRenderer.render(artifact)
        }
    }

    // MARK: - Preview

    private var preview: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack(spacing: Spacing.xs) {
                Image("TappyLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 22, height: 22)
                Text("TappyAI").font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                Text("· " + String(localized: "share.previewFrom")).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            }
            Text(artifact.subject).font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary).lineLimit(2)
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 220)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
            }
            ForEach(Array(artifact.places.prefix(3).enumerated()), id: \.offset) { i, p in
                Text(previewLine(i, p)).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary).lineLimit(1)
            }
            if artifact.places.count > 3 {
                Text(String(format: String(localized: "share.morePlaces"), artifact.places.count - 3))
                    .font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            }
        }
        .padding(Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
    }

    private func previewLine(_ i: Int, _ p: SharedPlace) -> String {
        var s = "\(i + 1). \(p.name)"
        if let r = p.rating { s += "  ★ \(r)" }
        if let a = p.address { s += "  ·  \(a)" }
        return s
    }

    // MARK: - Targets

    private func tile(_ t: TappyShare.Target) -> some View {
        Button { handle(t) } label: {
            VStack(spacing: Spacing.xxs) {
                ZStack {
                    Circle().fill(tint(t)).frame(width: 44, height: 44)
                    if t == .email {
                        Image(systemName: "envelope.fill").foregroundStyle(.white)
                    } else {
                        Text(String(label(t).prefix(1))).font(TappyFont.bodyEmphasis).foregroundStyle(.white)
                    }
                }
                Text(label(t)).font(TappyFont.caption).foregroundStyle(TappyColor.textPrimary).multilineTextAlignment(.center).lineLimit(2)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.xs)
        }
        .buttonStyle(.plain)
    }

    private func row(_ t: TappyShare.Target, system: String) -> some View {
        Button { handle(t) } label: {
            HStack(spacing: Spacing.sm) {
                Image(systemName: system).foregroundStyle(TappyColor.textSecondary)
                Text(label(t)).font(TappyFont.body).foregroundStyle(TappyColor.textPrimary)
                Spacer()
            }
            .padding(Spacing.sm)
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
        }
        .buttonStyle(.plain)
    }

    private func label(_ t: TappyShare.Target) -> String {
        switch t {
        case .facebook: return String(localized: "share.facebook")
        case .messenger: return String(localized: "share.messenger")
        case .zalo: return String(localized: "share.zalo")
        case .whatsapp: return String(localized: "share.whatsapp")
        case .telegram: return String(localized: "share.telegram")
        case .viber: return String(localized: "share.viber")
        case .line: return String(localized: "share.line")
        case .tiktok: return String(localized: "share.tiktok")
        case .email: return String(localized: "share.email")
        case .inbox: return String(localized: "share.inbox")
        case .save: return String(localized: "share.save")
        case .copy: return String(localized: "share.copyContent")
        case .native: return String(localized: "share.more")
        }
    }

    private func tint(_ t: TappyShare.Target) -> Color {
        switch t {
        case .facebook: return Color(hex: 0x1877F2)
        case .messenger: return Color(hex: 0x0084FF)
        case .zalo: return Color(hex: 0x0068FF)
        case .whatsapp: return Color(hex: 0x25D366)
        case .telegram: return Color(hex: 0x26A5E4)
        case .viber: return Color(hex: 0x7360F2)
        case .line: return Color(hex: 0x06C755)
        case .tiktok: return Color(hex: 0x010101)
        case .email: return Color(hex: 0xEA4335)
        default: return Color(hex: 0x6B7280)
        }
    }

    // MARK: - Delivery

    private func handle(_ t: TappyShare.Target) {
        let body = ShareArtifactBuilder.inboxBody(artifact, lang: lang)
        switch t {
        case .viber, .line, .whatsapp, .telegram:
            // Documented text endpoints: the brochure travels inside the URL.
            if let s = TappyShare.buildTextShareURL(t, subject: artifact.subject, text: body, url: artifact.url),
               let url = URL(string: s), canOpen(t) {
                UIApplication.shared.open(url)
                feedback = String(format: String(localized: "share.openedWithText"), label(t))
            } else {
                copy(body)
                feedback = String(format: String(localized: "share.appNotOpened"), label(t))
            }

        case .zalo:
            copy(body)
            if let scheme = TappyShare.appScheme(t), let url = URL(string: "\(scheme)://"), canOpen(t) {
                UIApplication.shared.open(url)
                feedback = String(format: String(localized: "share.copiedAndOpened"), label(t))
            } else {
                feedback = String(format: String(localized: "share.appNotOpened"), label(t))
            }

        case .messenger:
            // Messenger's own share deep link carries the brand url; the brochure is copied first.
            copy(body)
            if let s = TappyShare.buildShareURL(.messenger, canonicalURL: artifact.url), let url = URL(string: s), canOpen(t) {
                UIApplication.shared.open(url)
                feedback = String(format: String(localized: "share.copiedAndOpened"), label(t))
            } else {
                feedback = String(format: String(localized: "share.appNotOpened"), label(t))
            }

        case .facebook:
            // The sharer dialog with the brand url, brochure on the clipboard — same as web.
            copy(body)
            if let s = TappyShare.buildShareURL(.facebook, canonicalURL: artifact.url), let url = URL(string: s) {
                UIApplication.shared.open(url)
                feedback = String(format: String(localized: "share.copiedAndOpened"), label(t))
            } else {
                feedback = String(localized: "share.copiedContent")
            }

        case .tiktok:
            // No text or link endpoint exists; say so.
            copy(body)
            feedback = String(format: String(localized: "share.appNotOpened"), label(t))

        case .email:
            if let s = TappyShare.buildTextShareURL(.email, subject: artifact.subject, text: body), let url = URL(string: s) {
                UIApplication.shared.open(url) { ok in
                    if ok { feedback = String(localized: "share.emailOpened") }
                    else { copy(body); feedback = String(localized: "share.copiedContent") }
                }
            } else {
                copy(body)
                feedback = String(localized: "share.copiedContent")
            }

        case .inbox:
            // The web Messenger is the only Tappy Inbox; iOS opens it (Universal Link when the
            // app is not the handler, Safari otherwise) with the brochure on the clipboard.
            copy(body)
            if let url = URL(string: TappyShare.inboxURL) { UIApplication.shared.open(url) }
            feedback = String(localized: "share.inboxOpened")

        case .save:
            if let image {
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                feedback = String(localized: "share.savedImage")
            } else {
                present(items: [artifact.text])
                feedback = String(localized: "share.saveText")
            }

        case .copy:
            copy(artifact.text)
            feedback = String(localized: "share.copiedContent")

        case .native:
            var items: [Any] = [artifact.text]
            if let image { items.append(image) }
            present(items: items)
        }
    }

    private func canOpen(_ t: TappyShare.Target) -> Bool {
        guard let scheme = TappyShare.appScheme(t), let url = URL(string: "\(scheme)://") else { return false }
        return UIApplication.shared.canOpenURL(url)
    }

    private func copy(_ text: String) {
        UIPasteboard.general.string = text
    }

    private func present(items: [Any]) {
        let av = UIActivityViewController(activityItems: items, applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first?.rootViewController else { return }
        var top = root
        while let p = top.presentedViewController { top = p }
        if let popover = av.popoverPresentationController {
            popover.sourceView = top.view
            popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        top.present(av, animated: true)
    }
}

// MARK: - Card image

/// The branded card, painted FROM the artifact with SwiftUI's built-in `ImageRenderer`
/// (iOS 16+) — no dependency. Text-and-brand only: no network photos on the render path.
enum ShareCardRenderer {
    @MainActor
    static func render(_ a: ShareArtifact) -> UIImage? {
        let renderer = ImageRenderer(content: ShareCardView(artifact: a))
        renderer.scale = 2
        renderer.proposedSize = ProposedViewSize(width: 540, height: nil)
        return renderer.uiImage
    }
}

struct ShareCardView: View {
    let artifact: ShareArtifact

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image("TappyLogo").resizable().scaledToFit().frame(width: 28, height: 28)
                Text("TappyAI").font(.system(size: 17, weight: .bold)).foregroundStyle(.white)
            }
            Text(artifact.subject).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color(hex: 0x93C5FD)).lineLimit(2)

            if artifact.kind == .places {
                ForEach(Array(artifact.places.prefix(5).enumerated()), id: \.offset) { i, p in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(i + 1). \(p.name)").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                        let meta = [p.rating.map { "★ \($0)" + (p.ratingCount.map { n in " (\(n))" } ?? "") }, p.category, p.priceRangeText]
                            .compactMap { $0 }.joined(separator: "  ·  ")
                        if !meta.isEmpty { Text(meta).font(.system(size: 11)).foregroundStyle(Color(hex: 0xFBBF24)).lineLimit(1) }
                        let sub = [p.address, p.openingHours.map { "🕐 \($0)" }, p.phone.map { "☎ \($0)" }].compactMap { $0 }.joined(separator: "  ·  ")
                        if !sub.isEmpty { Text(sub).font(.system(size: 11)).foregroundStyle(Color(hex: 0xCBD5E1)).lineLimit(1) }
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white.opacity(0.04))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                if artifact.places.count > 5 {
                    Text("+\(artifact.places.count - 5)").font(.system(size: 11)).foregroundStyle(Color(hex: 0x94A3B8))
                }
            } else {
                ForEach(Array(artifact.text.components(separatedBy: "\n").dropFirst().prefix(8).enumerated()), id: \.offset) { _, l in
                    Text(l).font(.system(size: 12)).foregroundStyle(Color(hex: 0xCBD5E1)).lineLimit(1)
                }
            }

            Text("TappyAI · " + artifact.url.replacingOccurrences(of: "https://", with: ""))
                .font(.system(size: 11)).foregroundStyle(Color(hex: 0x64748B)).padding(.top, 4)
        }
        .padding(20)
        .frame(width: 540, alignment: .leading)
        .background(Color(hex: 0x111A2E))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(8)
        .background(Color(hex: 0x0B1220))
    }
}
