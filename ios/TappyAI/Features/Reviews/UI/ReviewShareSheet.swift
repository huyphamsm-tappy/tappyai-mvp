import SwiftUI

/// The review share sheet.
///
/// Targets, order, canonical origin and the URL guard all come from `TappyShare`, which mirrors the
/// web contract in `src/lib/share/shareTargets.ts` and the Android one in `TappyShare.kt`. Nothing
/// here builds a URL: the sheet used to take an injected `baseURL`, which is how a preview or
/// staging host could end up in a link a user hands to someone else.
///
/// TappyAI hands off a link. It does not publish to any network, and nothing here may say it did.
struct ReviewShareSheet: View {
    let review: Review
    let onDismiss: () -> Void

    @State private var copied = false
    @State private var showTikTokHint = false

    private var shareURL: String {
        TappyShare.reviewURL(review.id)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.lg) {
                Text("share.title")
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.textPrimary)

                HStack(alignment: .top, spacing: Spacing.md) {
                    ForEach(TappyShare.targets, id: \.self) { target in
                        ShareTargetButton(
                            target: target,
                            isCopied: copied && target == .copy,
                            action: { perform(target) }
                        )
                    }
                }

                if showTikTokHint {
                    Text("share.tiktokHint")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                        .multilineTextAlignment(.center)
                }

                Text(shareURL)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(Spacing.sm)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm))

                Spacer()
            }
            .padding(Spacing.lg)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("share.close", action: onDismiss)
                }
            }
        }
    }

    /// Performs a target's action.
    ///
    /// Facebook and Zalo get a URL handoff. TikTok publishes no web endpoint for handing off an
    /// arbitrary link, so it opens the iOS share sheet — if TikTok is installed the system may offer
    /// it as a destination. That is the user sharing, not TappyAI posting.
    private func perform(_ target: TappyShare.Target) {
        switch target {
        case .facebook, .zalo:
            guard let handoff = TappyShare.buildShareURL(target, canonicalURL: shareURL),
                  let url = URL(string: handoff)
            else { return }
            UIApplication.shared.open(url)

        case .tiktok, .native:
            // The guard runs here too: an unshareable URL must reach no other app.
            guard TappyShare.isShareableURL(shareURL) else { return }
            showTikTokHint = target == .tiktok
            presentSystemShare(shareURL)

        case .copy:
            guard TappyShare.isShareableURL(shareURL) else { return }
            UIPasteboard.general.string = shareURL
            copied = true
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                copied = false
            }
        }
    }

    private func presentSystemShare(_ url: String) {
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first?.rootViewController
        else { return }
        if let popover = controller.popoverPresentationController {
            popover.sourceView = root.view
            popover.sourceRect = CGRect(
                x: root.view.bounds.midX,
                y: root.view.bounds.midY,
                width: 0, height: 0
            )
            popover.permittedArrowDirections = []
        }
        root.present(controller, animated: true)
    }
}

/// One share target: a brand circle and its label.
///
/// Monograms rather than logos — shipping the networks' marks would mean vendoring trademarked
/// assets. 56pt clears the 44pt minimum touch target. Colours are fixed brand colours, so the
/// circles read the same in light and dark; only the label follows the theme.
private struct ShareTargetButton: View {
    let target: TappyShare.Target
    let isCopied: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: Spacing.xs) {
                ZStack {
                    Circle()
                        .fill(background)
                        .frame(width: 56, height: 56)
                    symbol
                }
                Text(labelKey)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(labelKey))
    }

    @ViewBuilder
    private var symbol: some View {
        switch target {
        case .facebook:
            Text(verbatim: "f").font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
        case .tiktok:
            Text(verbatim: "♪").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
        case .zalo:
            Text(verbatim: "Z").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
        case .copy:
            Image(systemName: isCopied ? "checkmark" : "doc.on.doc")
                .font(.system(size: 22))
                .foregroundStyle(isCopied ? TappyColor.success : TappyColor.textPrimary)
        case .native:
            Image(systemName: "ellipsis")
                .font(.system(size: 22))
                .foregroundStyle(TappyColor.textPrimary)
        }
    }

    private var background: Color {
        switch target {
        case .facebook: return Color(red: 0.09, green: 0.47, blue: 0.95)
        case .tiktok: return Color(red: 0.93, green: 0.11, blue: 0.32)
        case .zalo: return Color(red: 0.0, green: 0.41, blue: 1.0)
        case .copy, .native: return TappyColor.surface
        }
    }

    private var labelKey: LocalizedStringKey {
        switch target {
        case .facebook: return "share.facebook"
        case .tiktok: return "share.tiktok"
        case .zalo: return "share.zalo"
        case .copy: return isCopied ? "share.copied" : "share.copyLink"
        case .native: return "share.moreApps"
        }
    }
}
