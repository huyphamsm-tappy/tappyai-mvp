import SwiftUI

/// The server's `[TAPPY_MEDIA]` block as native cards (web `MediaBlocks.tsx`): a strip of news pictures, one or several Wikipedia subject cards
/// (with their «Thông tin nhanh» from Wikidata when the server has it), or the option cards of a recommendation. Every URL in `blocks` already
/// passed the host allow-lists in `MediaBlocks`: images load only from those hosts, and a tap opens only an article page of the listed outlets /
/// Wikipedia, or the safe https link the server attached to an option.
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
                case .options(let title, let options):
                    MediaOptionsGrid(title: title, options: options)
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
        AsyncImage(url: url.flatMap { safeWebURL($0) }) { phase in
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
                    if let destination = safeWebURL(item.href) {
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

/// The subject card: picture, name, summary, the quick facts (only the ones Wikidata has), and the Wikipedia link.
private struct MediaEntityCard: View {
    let entity: MediaBlock.Entity
    @EnvironmentObject private var deps: AppDependencies
    @State private var facts: [EntityFact] = []

    /// One ask per subject for the life of the app (the web keeps the same session cache).
    private static var cache: [String: [EntityFact]] = [:]

    var body: some View {
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
                if !facts.isEmpty { factsRow }
                if let destination = safeWebURL(entity.href) {
                    Link(destination: destination) {
                        Text("Wikipedia")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.primary)
                    }
                }
            }
            .padding(.horizontal, Spacing.sm)
            .padding(.bottom, Spacing.sm)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TappyColor.textSecondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .accessibilityElement(children: .contain)
        .task(id: entity.href) { await loadFacts() }
    }

    private var factsRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(verbatim: LocalizationManager.currentLanguageCode == "en" ? "Quick facts" : "Thông tin nhanh")
                .font(TappyFont.caption).fontWeight(.semibold)
                .foregroundStyle(TappyColor.textSecondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.xs) {
                    ForEach(facts, id: \.label) { fact in
                        Text(verbatim: "\(fact.label): \(fact.value)")
                            .font(.system(size: 12))
                            .foregroundStyle(TappyColor.textPrimary)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(TappyColor.textSecondary.opacity(0.12), in: Capsule())
                    }
                }
            }
        }
        .accessibilityIdentifier("entity-facts")
    }

    private func loadFacts() async {
        guard let wiki = EntityFacts.wikiTitle(fromHref: entity.href) else { return }
        let ui = LocalizationManager.currentLanguageCode == "en" ? "en" : "vi"
        let key = "\(wiki.wiki)|\(ui)|\(wiki.title.lowercased())"
        if let hit = Self.cache[key] { facts = hit; return }
        let endpoint = Endpoint(path: "/api/entity-facts", method: .get, query: [
            URLQueryItem(name: "t", value: wiki.title), URLQueryItem(name: "w", value: wiki.wiki), URLQueryItem(name: "ui", value: ui),
        ], requiresAuth: false, timeout: 8)
        guard let data = try? await deps.api.send(endpoint) else { return }
        let parsed = EntityFacts.parse(data)
        Self.cache[key] = parsed
        facts = parsed
    }
}

/// The option cards of a recommendation (web `OptionCards`): badge, name, the one figure shown large, verdict, highlights, extras, caveat and the
/// link the server attached. No picture (there is no owned picture for such an item). Two columns when there is room, one on a narrow screen.
private struct MediaOptionsGrid: View {
    let title: String?
    let options: [MediaBlock.Option]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            if let title {
                Text(verbatim: title)
                    .font(TappyFont.callout).fontWeight(.semibold)
                    .foregroundStyle(TappyColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 165), spacing: Spacing.sm, alignment: .top)], alignment: .leading, spacing: Spacing.sm) {
                ForEach(Array(options.enumerated()), id: \.offset) { _, option in card(option) }
            }
        }
        .accessibilityIdentifier("media-options")
    }

    private func card(_ o: MediaBlock.Option) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let badge = o.badge {
                Text(verbatim: badge)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(TappyColor.primary)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(TappyColor.primary.opacity(0.12), in: Capsule())
            }
            Text(verbatim: o.name)
                .font(TappyFont.callout).fontWeight(.semibold)
                .foregroundStyle(TappyColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let figure = o.figure {
                Text(verbatim: figure)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)
                if let note = o.figureNote {
                    Text(verbatim: note).font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
                }
            }
            if let verdict = o.verdict {
                Text(verbatim: verdict).font(TappyFont.caption).foregroundStyle(TappyColor.textPrimary)
            }
            ForEach(Array(o.highlights.enumerated()), id: \.offset) { _, line in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.green.opacity(0.85))
                    Text(verbatim: line).font(TappyFont.caption).foregroundStyle(TappyColor.textPrimary)
                }
            }
            ForEach(Array(o.extras.enumerated()), id: \.offset) { _, line in
                Text(verbatim: "+ " + line).font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
            }
            if let caveat = o.caveat {
                Text(verbatim: caveat).font(.system(size: 12).italic()).foregroundStyle(TappyColor.textSecondary)
            }
            if let href = o.href, let url = safeWebURL(href) {
                Link(destination: url) {
                    Text(verbatim: o.linkLabel ?? URL(string: href)?.host ?? href)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(TappyColor.primary)
                        .padding(.vertical, 4)
                }
            }
        }
        .padding(Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TappyColor.textSecondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}
