import SwiftUI

/// Horizontal scrolling image strip — matches Web's inline image gallery for place photos.
/// Renders `![alt](url)` images that ContentParser extracts.
struct ChatImageStrip: View {
    let images: [ParsedImage]
    let onZoom: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                ForEach(images) { img in
                    Button { onZoom(img.url) } label: {
                        AsyncImage(url: URL(string: img.url)) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 200, height: 160)
                                    .clipped()
                            case .failure:
                                EmptyView()
                            case .empty:
                                RoundedRectangle(cornerRadius: Radius.md)
                                    .fill(TappyColor.surface)
                                    .frame(width: 200, height: 160)
                                    .overlay(ProgressView())
                            @unknown default:
                                EmptyView()
                            }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// Fullscreen image zoom overlay — matches Web's image lightbox.
struct ImageZoomView: View {
    let url: String
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()
                .onTapGesture { onDismiss() }

            AsyncImage(url: URL(string: url)) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
                case .failure:
                    Text("Không tải được ảnh")
                        .foregroundStyle(.white)
                case .empty:
                    ProgressView().tint(.white)
                @unknown default:
                    EmptyView()
                }
            }
            .padding(Spacing.md)

            VStack {
                HStack {
                    Spacer()
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(.white.opacity(0.15))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .padding(Spacing.md)
                }
                Spacer()
            }
        }
    }
}
