import SwiftUI

/// The page a tap on an answer's link opens in the quick-read sheet (web `LinkDrawer`, owner 15/11/2026).
struct ReaderTarget: Identifiable, Equatable {
    let url: URL
    var id: String { url.absoluteString }
}

extension View {
    /// An ordinary `https` link in this view opens the quick-read sheet; a map, a video, a booking or shopping page, a partner link and a link of this
    /// site keep their usual behaviour (`ReaderLinks.target`). Applied only to an answer's text, its sources list and its cards, never to the booking
    /// buttons: the web's own scope.
    func readerLinks(onOpen: @escaping (ReaderTarget) -> Void) -> some View {
        environment(\.openURL, OpenURLAction { url in
            let ownHost = URL(string: TappyShare.canonicalOrigin)?.host
            guard let page = ReaderLinks.target(for: url, ownHost: ownHost) else { return .systemAction }
            onOpen(ReaderTarget(url: page))
            return .handled
        })
    }
}

/// What the page says of itself (title, site, date, description, its first passages: `GET /api/link-preview`), and always the button to the original
/// page, which stays the source. A page that cannot be read still opens the sheet with its address and that button: a tap never leads nowhere.
struct LinkReaderSheet: View {
    let target: ReaderTarget
    @Environment(\.dismiss) private var dismiss
    @State private var preview: LinkPreview?

    private var host: String {
        let h = target.url.host ?? ""
        return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text("chat.link.kind").font(TappyFont.caption.weight(.semibold)).foregroundStyle(TappyColor.primary)
                    Text(heading).font(TappyFont.headline).foregroundStyle(TappyColor.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(subtitle).font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)

                    if preview == nil {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("chat.link.loading").font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
                        }
                        .accessibilityIdentifier("link-reader-loading")
                    } else if let page = preview, page.ok {
                        if let date = page.publishedAt {
                            Text(String(format: NSLocalizedString("chat.link.published", comment: ""), Self.dateText(date)))
                                .font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
                        }
                        if let description = page.description {
                            Text(description).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        ForEach(Array(page.passages.enumerated()), id: \.offset) { _, passage in
                            Text(passage).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary.opacity(0.92))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if page.description == nil && page.passages.isEmpty { unreadable }
                    } else {
                        unreadable
                    }

                    Link(destination: target.url) {
                        Label("chat.link.open", systemImage: "arrow.up.right.square")
                            .font(TappyFont.callout.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("link-reader-original")

                    Text("chat.link.note").font(.system(size: 11)).foregroundStyle(TappyColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Spacing.md)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(NSLocalizedString("common.close", comment: "")) { dismiss() }
                }
            }
        }
        .task {
            switch await LinkPreviewService(api: DIContainer.shared.resolve(APIClient.self)).preview(of: target.url) {
            case .page(let page):
                preview = page
            case .unavailable:
                // An older server has no reader: open the page itself, as a link always did.
                UIApplication.shared.open(target.url)
                dismiss()
            }
        }
        .accessibilityIdentifier("link-reader")
    }

    private var unreadable: some View {
        Text("chat.link.unreadable").font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("link-reader-unreadable")
    }

    private var heading: String {
        if let page = preview, page.ok, let title = page.title { return title }
        return host
    }

    private var subtitle: String {
        if let page = preview, page.ok, let site = page.siteName { return site }
        return host
    }

    static func dateText(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: LocalizationManager.currentLanguageCode == "vi" ? "vi_VN" : "en_GB")
        f.dateStyle = .short
        f.timeStyle = .none
        return f.string(from: date)
    }
}
