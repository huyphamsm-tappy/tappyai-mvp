import SwiftUI

struct ReviewShareSheet: View {
    let review: Review
    let baseURL: String
    let onDismiss: () -> Void

    @State private var copied = false

    private var shareURL: String {
        "\(baseURL)/reviews/\(review.id)"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.lg) {
                Text("Chia sẻ bài review")
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.textPrimary)

                Button {
                    UIPasteboard.general.string = shareURL
                    copied = true
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        copied = false
                    }
                } label: {
                    HStack {
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                        Text(copied ? "Đã sao chép!" : "Sao chép link")
                    }
                    .font(TappyFont.button)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.sm)
                    .background(copied ? TappyColor.success : TappyColor.primary)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
                }
                .buttonStyle(.plain)

                Button {
                    let av = UIActivityViewController(
                        activityItems: [shareURL],
                        applicationActivities: nil
                    )
                    guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                          let root = scene.windows.first?.rootViewController else { return }
                    if let popover = av.popoverPresentationController {
                        popover.sourceView = root.view
                        popover.sourceRect = CGRect(
                            x: root.view.bounds.midX,
                            y: root.view.bounds.midY,
                            width: 0, height: 0
                        )
                        popover.permittedArrowDirections = []
                    }
                    root.present(av, animated: true)
                } label: {
                    HStack {
                        Image(systemName: "square.and.arrow.up")
                        Text("Chia sẻ qua...")
                    }
                    .font(TappyFont.button)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.sm)
                    .background(TappyColor.surface)
                    .foregroundStyle(TappyColor.textPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
                }
                .buttonStyle(.plain)

                Spacer()
            }
            .padding(Spacing.lg)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Đóng", action: onDismiss)
                }
            }
        }
    }
}
