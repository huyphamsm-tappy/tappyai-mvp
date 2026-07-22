import SwiftUI

/// "🔖 Lưu địa điểm" button — matches Web's SavePlaceButton.
/// Shows on every assistant message with CTA buttons. Tapping opens an inline
/// text field pre-filled with the detected place name.
struct SavePlaceButton: View {
    let text: String
    let buttons: [CTAButton]
    let onSave: (String) -> Void

    @State private var isOpen = false
    @State private var placeName = ""
    @State private var saving = false
    @State private var saved = false

    var body: some View {
        if isOpen {
            HStack(spacing: Spacing.xs) {
                TextField("Tên địa điểm muốn lưu?", text: $placeName)
                    .font(TappyFont.caption)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, 6)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                            .stroke(TappyColor.separator, lineWidth: 1)
                    )
                    .onSubmit { handleSave() }

                Button(action: handleSave) {
                    Text(saved ? "✓" : saving ? "..." : "Lưu")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 6)
                        .background(placeName.trimmingCharacters(in: .whitespaces).isEmpty || saving
                                    ? TappyColor.primary.opacity(0.5) : TappyColor.primary)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(placeName.trimmingCharacters(in: .whitespaces).isEmpty || saving)

                Button { isOpen = false } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, Spacing.xxs)
        } else {
            Button {
                placeName = ContentParser.detectFirstPlaceName(text: text, buttons: buttons)
                isOpen = true
            } label: {
                Text("🔖 Lưu địa điểm")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
        }
    }

    private func handleSave() {
        let name = placeName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !saving else { return }
        saving = true
        onSave(name)
        saved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            isOpen = false
            saved = false
            saving = false
        }
    }
}

/// Heart toggle next to internal_booking CTA buttons — matches Web's FavoriteToggle.
struct FavoriteToggle: View {
    let placeId: String
    let placeName: String
    let placeAddress: String
    let placeType: String
    let onToggle: (String, String, String, String) -> Void

    @State private var saved = false
    @State private var loading = false

    var body: some View {
        Button {
            guard !loading, !placeId.isEmpty else { return }
            loading = true
            saved.toggle()
            onToggle(placeId, placeName, placeAddress, placeType)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { loading = false }
        } label: {
            Image(systemName: saved ? "heart.fill" : "heart")
                .font(.system(size: 12))
                .foregroundStyle(saved ? Color.red : TappyColor.textSecondary)
                .frame(width: 28, height: 28)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .stroke(TappyColor.separator, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .disabled(loading || placeId.isEmpty)
        .opacity(placeId.isEmpty ? 0 : 1)
    }
}
