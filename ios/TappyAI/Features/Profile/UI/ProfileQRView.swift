import SwiftUI

/// "Share profile": the QR of the public profile URL, the link under it, and a share button.
struct ProfileQRView: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.lg) {
                Text("qr.scanHint")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(TappyColor.textPrimary)
                    .multilineTextAlignment(.center)

                Group {
                    if let image {
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
                .frame(width: 240, height: 240)
                .padding(Spacing.md)
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
            }
        }
    }
}
