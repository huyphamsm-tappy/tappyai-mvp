import SwiftUI

/// The server's `[TAPPY_MEDIA]` block as native cards (web `MediaBlocks.tsx`): a strip of news pictures, or one or
/// several Wikipedia subject cards. Every URL in `blocks` already passed the host allow-lists in `MediaBlocks`:
/// images load only from those hosts, and a tap opens only an article page of the listed outlets / Wikipedia.
struct MediaBlocksView: View {
    let blocks: [MediaBlock]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .news(let items):
                    MediaNewsStrip(items: items)
                case .entities(let entities):
                    ForEach(entities, id: \.href) { MediaEntityCard(entity: $0) }
                }
            }
        }
        .accessibilityIdentifier("chat-media-blocks")
    }
}

private struct MediaPicture: View {
    let url: String?
    let height: CGFloat

    var body: some View {
        AsyncImage(url: url.flatMap { URL(string: $0) }) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                Rectangle().fill(TappyColor.textSecondary.opacity(0.15))
            }
        }
        .frame(height: height)
        .clipped()
    }
}

private struct MediaNewsStrip: View {
    let items: [MediaBlock.NewsItem]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: Spacing.sm) {
                ForEach(items, id: \.href) { item in
                    if let destination = URL(string: item.href) {
                        Link(destination: destination) {
                            VStack(alignment: .leading, spacing: Spacing.xxs) {
                                MediaPicture(url: item.src, height: 112)
                                Text(item.label)
                                    .font(TappyFont.caption)
                                    .foregroundStyle(TappyColor.textSecondary)
                                    .lineLimit(1)
                                    .padding(.horizontal, Spacing.sm)
                                Text(item.title)
                                    .font(TappyFont.caption)
                                    .foregroundStyle(TappyColor.textPrimary)
                                    .lineLimit(3)
                                    .multilineTextAlignment(.leading)
                                    .padding(.horizontal, Spacing.sm)
                                    .padding(.bottom, Spacing.sm)
                            }
                            .frame(width: 200, alignment: .leading)
                            .background(TappyColor.textSecondary.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(item.title.isEmpty ? item.label : item.title)
                    }
                }
            }
        }
    }
}

private struct MediaEntityCard: View {
    let entity: MediaBlock.Entity

    var body: some View {
        if let destination = URL(string: entity.href) {
            Link(destination: destination) {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    if entity.image != nil {
                        MediaPicture(url: entity.image, height: 160)
                    }
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text(entity.name)
                            .font(TappyFont.callout)
                            .fontWeight(.semibold)
                            .foregroundStyle(TappyColor.textPrimary)
                        Text(entity.summary)
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textPrimary)
                            .lineLimit(6)
                            .multilineTextAlignment(.leading)
                        Text("Wikipedia")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.primary)
                    }
                    .padding(.horizontal, Spacing.sm)
                    .padding(.bottom, Spacing.sm)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(TappyColor.textSecondary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            }
            .accessibilityElement(children: .combine)
        }
    }
}
