import SwiftUI
import UIKit

/// Share a review or an Explore clip — mockup #6 ("Chia sẻ với mọi người"), Android `TappyShareSheet`.
///
/// The "Ảnh chia sẻ" block renders the chosen layout ONCE (`ShareCardFiles`) and shows that very
/// image; "Lưu về máy" and "Gửi ảnh" (TikTok, Zalo… through the system share sheet) hand over the
/// SAME file. Layouts: the post's own card (review / clip, sample #1) or the TappyAI QR card.
///
/// A share is recorded in the account's "Đã chia sẻ" history (`POST /api/reviews/{id}/share`) only
/// after it really completed — opening this sheet, or dismissing the system sheet, records nothing.
struct ReviewShareSheet: View {
    let review: Review
    /// Kept for the callers; the link and the card code use the canonical public origin.
    let baseURL: String
    let onDismiss: () -> Void

    @EnvironmentObject private var deps: AppDependencies
    @EnvironmentObject private var localization: LocalizationManager

    @State private var copied = false
    @State private var layout: ShareCardLayout = .review
    @State private var card: ShareCardFiles.Card?
    @State private var rendering = false
    @State private var feedback: String?
    @State private var fetchingVideo = false
    private let cardFiles = ShareCardFiles()

    private var shareURL: String { TappyShare.reviewURL(review.id) }
    private var post: SharePostCard { SharePostCard(review: review) }
    private var layouts: [ShareCardLayout] {
        ShareCardLayout.offered(post: post, isProfile: false, hasPlan: false, hasPlaces: false)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    Text("review.share.title").font(TappyFont.headline).foregroundStyle(TappyColor.textPrimary)

                    copyLinkButton

                    Text("share.cardTitle").font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                        .padding(.top, Spacing.xs)
                    if layouts.count > 1 {
                        Picker("", selection: $layout) {
                            ForEach(layouts, id: \.self) { l in Text(LocalizedStringKey(pickerKey(l))).tag(l) }
                        }
                        .pickerStyle(.segmented)
                        .accessibilityIdentifier("share-layout-picker")
                    }
                    preview

                    HStack(spacing: Spacing.sm) {
                        actionButton("share.save", system: "square.and.arrow.down", id: "share-save") { saveCard() }
                        actionButton("share.sendImage", system: "photo.on.rectangle", id: "share-send-image") { sendImage() }
                    }
                    // An uploaded clip goes to TikTok (and any app) as the VIDEO itself — the approved
                    // exception to "one file" (28/09); if the video cannot be fetched, the card image.
                    if let videoURL = ClipVideoFile.sourceURL(of: review) {
                        actionButton(LocalizedStringKey(fetchingVideo ? "share.videoPreparing" : "share.sendVideo"),
                                     system: "video", id: "share-send-video") { sendVideo(videoURL) }
                            .disabled(fetchingVideo)
                    }
                    actionButton("review.share.via", system: "square.and.arrow.up", id: "share-link-via") { shareLink() }

                    if let feedback {
                        Text(feedback).font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
                    }
                }
                .padding(Spacing.lg)
            }
            .background(TappyColor.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(NSLocalizedString("common.close", comment: ""), action: onDismiss)
                }
            }
        }
        .task {
            if let first = layouts.first { layout = first }
        }
        .task(id: layout) { await renderCard() }
    }

    // MARK: - Pieces

    private var copyLinkButton: some View {
        Button {
            UIPasteboard.general.string = shareURL
            copied = true
            record(channel: "copy")
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                copied = false
            }
        } label: {
            HStack {
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                Text(copied ? NSLocalizedString("common.copied", comment: "") : NSLocalizedString("review.share.copyLink", comment: ""))
            }
            .font(TappyFont.button)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.sm)
            .background(copied ? TappyColor.success : TappyColor.primary)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var preview: some View {
        ZStack {
            if let card {
                Image(uiImage: card.image).resizable().scaledToFit()
                    .accessibilityIdentifier("share-card-preview")
            } else {
                RoundedRectangle(cornerRadius: Radius.md).fill(TappyColor.surface).aspectRatio(9.0 / 16.0, contentMode: .fit)
                if rendering { ProgressView() }
            }
        }
        .frame(maxHeight: 420)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
    }

    private func actionButton(_ key: LocalizedStringKey, system: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Image(systemName: system)
                Text(key)
            }
            .font(TappyFont.button)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.sm)
            .background(TappyColor.surface)
            .foregroundStyle(TappyColor.textPrimary)
            .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    private func pickerKey(_ l: ShareCardLayout) -> String {
        switch l {
        case .clip: return "share.layout.clip"
        case .review: return "share.layout.review"
        default: return "share.layout.qr"
        }
    }

    // MARK: - Actions

    private func renderCard() async {
        rendering = true
        defer { rendering = false }
        let lang = localization.language.rawValue
        let input = ShareCardInput(layout: layout, url: shareURL, displayName: post.title,
                                   post: layout == .post ? nil : post, lang: lang)
        card = await cardFiles.card(input)
        if card == nil { feedback = NSLocalizedString("share.cardFailed", comment: "") }
    }

    private func saveCard() {
        guard let card else { return }
        UIImageWriteToSavedPhotosAlbum(card.image, nil, nil, nil)
        feedback = NSLocalizedString("share.savedImage", comment: "")
    }

    /// The card FILE through the system sheet — TikTok, Zalo, Messenger… receive the same PNG.
    private func sendImage() {
        guard let card else { return }
        present(items: [card.fileURL])
    }

    private func sendVideo(_ url: URL) {
        fetchingVideo = true
        Task { @MainActor in
            defer { fetchingVideo = false }
            if let file = await ClipVideoFile.download(url, reviewId: review.id) {
                present(items: [file])
            } else if let card {
                feedback = NSLocalizedString("share.videoFallback", comment: "")
                present(items: [card.fileURL])
            } else {
                feedback = NSLocalizedString("share.cardFailed", comment: "")
            }
        }
    }

    private func shareLink() {
        present(items: [shareURL])
    }

    private func present(items: [Any]) {
        let av = UIActivityViewController(activityItems: items, applicationActivities: nil)
        av.completionWithItemsHandler = { type, completed, _, _ in
            guard completed else { return }
            let channel = type.map { "ios:" + $0.rawValue } ?? "native"
            Task { @MainActor in record(channel: channel) }
        }
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

    private func record(channel: String) {
        let service = ReviewsService(api: deps.api)
        let id = review.id
        Task { await service.recordShare(reviewId: id, channel: channel) }
    }
}
