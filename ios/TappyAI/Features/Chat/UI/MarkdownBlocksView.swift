import SwiftUI

/// An answer's Markdown drawn block by block (web formatMessage / ArticleAnswer, Android TappyMarkdown): headings sized by level, bullets and
/// numbers indented by depth, quotes with a bar, code in monospace on a tinted ground, tables as a bordered grid (header row bold, scrolling
/// sideways when wider than the bubble), rules. The words inside a block are read by `ContentParser.renderMarkdown` - the one inline reader,
/// which keeps a link only for http(s) and never for another AI product's page. An address is not opened here: the text's own links go through
/// the system as they always did for the plain text view.
struct MarkdownBlocksView: View {
    let blocks: [MarkdownBlock]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                MarkdownBlockView(block: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MarkdownBlockView: View {
    let block: MarkdownBlock

    private func inline(_ text: String) -> Text {
        Text(ContentParser.renderMarkdown(text))
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return TappyFont.title
        case 2: return TappyFont.headline
        default: return TappyFont.bodyEmphasis
        }
    }

    var body: some View {
        switch block {
        case .heading(let level, let text):
            inline(text)
                .font(headingFont(level))
                .foregroundStyle(TappyColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, level <= 2 ? Spacing.xs : Spacing.xxs)
                .accessibilityAddTraits(.isHeader)

        case .paragraph(let text):
            inline(text)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)

        case .bullet(let depth, let text):
            HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                Text(verbatim: depth == 0 ? "•" : "◦")
                    .font(TappyFont.body)
                    .foregroundStyle(TappyColor.textSecondary)
                    .accessibilityHidden(true)
                inline(text)
                    .font(TappyFont.body)
                    .foregroundStyle(TappyColor.textPrimary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.leading, CGFloat(depth) * Spacing.md)

        case .numbered(let n, let depth, let text):
            HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                Text(verbatim: "\(n).")
                    .font(TappyFont.body)
                    .monospacedDigit()
                    .foregroundStyle(TappyColor.textSecondary)
                inline(text)
                    .font(TappyFont.body)
                    .foregroundStyle(TappyColor.textPrimary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.leading, CGFloat(depth) * Spacing.md)

        case .quote(let text):
            inline(text)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, Spacing.sm)
                .overlay(alignment: .leading) {
                    Rectangle().fill(TappyColor.border).frame(width: 3)
                }

        case .code(let lines):
            ScrollView(.horizontal, showsIndicators: false) {
                Text(verbatim: lines.joined(separator: "\n"))
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(TappyColor.textPrimary)
                    .textSelection(.enabled)
                    .padding(Spacing.sm)
            }
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))

        case .table(let rows):
            MarkdownTableView(rows: rows)

        case .rule:
            Divider().padding(.vertical, Spacing.xxs)
        }
    }
}

/// A table: one fixed width per column, the same in every row, so the columns line up; the header row bold on a tinted ground; cell borders;
/// a table wider than the bubble scrolls sideways (web: overflow-x-auto).
private struct MarkdownTableView: View {
    let rows: [[String]]

    private let columnWidth: CGFloat = 150

    private var columnCount: Int { rows.first?.count ?? 0 }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: true) {
            Grid(alignment: .topLeading, horizontalSpacing: 0, verticalSpacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                    GridRow {
                        ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                            cellView(cell, isHeader: r == 0)
                        }
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text("chat.table.label"))
        .accessibilityValue(Text("chat.table.size \(rows.count) \(columnCount)"))
    }

    private func cellView(_ cell: String, isHeader: Bool) -> some View {
        Text(ContentParser.renderMarkdown(cell))
            .font(TappyFont.footnote.weight(isHeader ? .semibold : .regular))
            .foregroundStyle(TappyColor.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(Spacing.xs)
            .frame(width: columnWidth, alignment: .topLeading)
            .frame(maxHeight: .infinity, alignment: .topLeading)
            .background(isHeader ? TappyColor.surface : Color.clear)
            .border(TappyColor.border, width: 0.5)
    }
}

/// A picture of the answer's section or list item, full width under its heading (web ArticleAnswer; Android `ArticlePicture`). One that fails
/// to load takes no room. Tapping it opens the same zoom as the pictures written in the text.
struct ArticlePictureView: View {
    let item: DocMediaItem
    let onZoom: (String) -> Void

    private let pictureHeight: CGFloat = 200

    var body: some View {
        AsyncImage(url: URL(string: item.src)) { phase in
            switch phase {
            case .success(let image):
                Button { onZoom(item.src) } label: {
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(maxWidth: .infinity)
                        .frame(height: pictureHeight)
                        .clipped()
                }
                .buttonStyle(.plain)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .accessibilityLabel(Text(verbatim: item.title))
                .accessibilityAddTraits(.isImage)
            case .failure:
                EmptyView()
            case .empty:
                RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                    .fill(TappyColor.surface)
                    .frame(height: pictureHeight)
                    .overlay(ProgressView())
            @unknown default:
                EmptyView()
            }
        }
        .padding(.vertical, Spacing.xxs)
    }
}
