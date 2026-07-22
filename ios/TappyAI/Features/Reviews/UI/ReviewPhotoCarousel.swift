import SwiftUI

struct ReviewPhotoCarousel: View {
    let photos: [String]
    @State private var currentPage = 0

    var body: some View {
        ZStack {
            TabView(selection: $currentPage) {
                ForEach(Array(photos.enumerated()), id: \.offset) { index, url in
                    AsyncImage(url: URL(string: url)) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        case .failure:
                            Color.black
                                .overlay(
                                    Image(systemName: "photo")
                                        .foregroundStyle(TappyColor.feedTextSecondary)
                                        .font(.system(size: 40))
                                )
                        default:
                            Color.black
                                .overlay(ProgressView().tint(.white))
                        }
                    }
                    .tag(index)
                    .clipped()
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            VStack {
                if photos.count > 1 {
                    HStack {
                        Spacer()
                        Text("\(currentPage + 1)/\(photos.count)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, Spacing.xxs)
                            .background(.black.opacity(0.5))
                            .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
                            .padding(.trailing, Spacing.md)
                            .padding(.top, Spacing.md)
                    }
                }

                Spacer()

                if photos.count > 1 {
                    dotsIndicator
                        .padding(.bottom, Spacing.md)
                }
            }
        }
    }

    private var dotsIndicator: some View {
        HStack(spacing: 4) {
            ForEach(0..<photos.count, id: \.self) { i in
                Circle()
                    .fill(i == currentPage ? Color.white : Color.white.opacity(0.4))
                    .frame(width: 6, height: 6)
            }
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.xxs)
        .background(.ultraThinMaterial.opacity(0.6))
        .clipShape(Capsule())
    }
}
