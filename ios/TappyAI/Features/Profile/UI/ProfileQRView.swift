import SwiftUI

/// "Share profile": the QR of the public profile URL, the link under it, and a share button.
struct ProfileQRView: View {
    let url: URL
    /// Printed on the card under the code; empty draws no name.
    var displayName: String = ""
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var localization: LocalizationManager
    @State private var image: UIImage?
    @State private var failed = false
    @State private var card: ShareCardFiles.Card?
    private let cardFiles = ShareCardFiles()

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.lg) {
                Text("qr.scanHint")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(TappyColor.textPrimary)
                    .multilineTextAlignment(.center)

                Group {
                    if card != nil {
                        EmptyView()   // the branded card below replaces the bare code
                    } else if let image {
                        Image(uiImage: image)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .accessibilityLabel(Text("qr.title"))
                    } else if failed {
                        Text("qr.failed")
                            .font(.system(size: 13))
                            .foregroundStyle(TappyColor.textSecondary)
                            .multilineTextAlignment(.center)
                    } else {
                        ProgressView()
                    }
                }
                .frame(width: card == nil ? 240 : 0, height: card == nil ? 240 : 0)
                .padding(card == nil ? Spacing.md : 0)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))

                Text(url.absoluteString)
                    .font(.system(size: 12))
                    .foregroundStyle(TappyColor.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)

                Text("qr.saveHint")
                    .font(.system(size: 12))
                    .foregroundStyle(TappyColor.textSecondary)

                ShareLink(item: url) {
                    Label {
                        Text("qr.share")
                    } icon: {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .foregroundStyle(.white)
                    .background(TappyColor.primary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                }

                // The approved TappyAI QR card (sample #1): the SAME file is previewed, saved and sent.
                if let card {
                    Image(uiImage: card.image).resizable().scaledToFit()
                        .frame(maxHeight: 360)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                        .accessibilityIdentifier("share-card-preview")
                    HStack(spacing: Spacing.sm) {
                        Button {
                            UIImageWriteToSavedPhotosAlbum(card.image, nil, nil, nil)
                        } label: {
                            Label("share.save", systemImage: "square.and.arrow.down")
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(TappyColor.surface)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("share-save")
                        ShareLink(item: card.fileURL) {
                            Label("share.sendImage", systemImage: "photo.on.rectangle")
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(TappyColor.surface)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                        }
                        .buttonStyle(.plain)
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(TappyColor.textPrimary)
                }

                Spacer()
            }
            .padding(Spacing.lg)
            .background(TappyColor.background)
            .navigationTitle(Text("qr.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("common.close", comment: "")) { dismiss() }
                }
            }
            .task {
                image = ProfileQR.image(for: url.absoluteString)
                failed = image == nil
                card = await cardFiles.card(ShareCardInput(layout: .profile, url: url.absoluteString,
                                                           displayName: displayName, lang: localization.language.rawValue))
            }
        }
    }
}
