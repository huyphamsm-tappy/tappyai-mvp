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
            ForEach(Array(MarkdownPresentation.items(blocks).enumerated()), id: \.offset) { _, item in
                switch item {
                case .block(let block):
                    MarkdownBlockView(block: block)
                case .dataBox(let title, let rows, let caption):
                    // Data box (spec §B): the title above, the grid that scrolls sideways, the caption below.
                    VStack(alignment: .leading, spacing: Spacing.xxs) {
                        if let title {
                            Text(ContentParser.renderMarkdown(title))
                                .font(TappyFont.bodyEmphasis)
                                .foregroundStyle(TappyColor.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        MarkdownTableView(rows: rows)
                        if let caption {
                            Text(ContentParser.renderMarkdown(caption))
                                .font(TappyFont.footnote)
                                .foregroundStyle(TappyColor.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
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
            // No `.textSelection(.enabled)` on the blocks of a reply (27/11): a finished answer that switches to many selectable Texts at once
            // was a suspect for the screen freezing at the end of a turn. Copy under the reply copies the whole text.
            inline(text)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
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
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.leading, CGFloat(depth) * Spacing.md)

        case .quote(let text):
            inline(text)
                .font(TappyFont.body)
                .foregroundStyle(ChatTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, Spacing.sm)
                .padding(.vertical, Spacing.xs)
                .padding(.trailing, Spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                // web ArticleAnswer (dark): orange left bar on #2a2113
                .background(ChatTheme.quoteBackground)
                .overlay(alignment: .leading) {
                    Rectangle().fill(ChatTheme.quoteBar).frame(width: 3)
                }
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))

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

    /// The first column stays on the left while the others scroll; every column of a row shares the row's height, measured from the cells.
    private let pinnedWidth: CGFloat = 120
    private let columnWidth: CGFloat = 150

    /// The height each row needs: the tallest of its cells, reported by the cells themselves (both halves report into the same key).
    @State private var rowHeights: [Int: CGFloat] = [:]

    private var columnCount: Int { rows.first?.count ?? 0 }

    var body: some View {
        // Owner 28/11: a wide table made the person slide left and right to read it. On a phone a table of three or more columns is read as
        // CARDS, one per row: the first cell is the title, the others follow as «Header: value» lines. Two columns still fit and stay a grid.
        if columnCount >= 3, rows.count > 1 {
            cards
        } else {
            grid
        }
    }

    private var cards: some View {
        let header = rows[0]
        return VStack(alignment: .leading, spacing: Spacing.xs) {
            ForEach(Array(rows.dropFirst().enumerated()), id: \.offset) { _, row in
                VStack(alignment: .leading, spacing: 4) {
                    Text(ContentParser.renderMarkdown(row.first ?? ""))
                        .font(TappyFont.body.weight(.semibold))
                        .foregroundStyle(TappyColor.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(Array(row.enumerated().dropFirst()), id: \.offset) { i, cell in
                        let value = cell.trimmingCharacters(in: .whitespaces)
                        if !value.isEmpty, value != "-", value != "—" {
                            VStack(alignment: .leading, spacing: 0) {
                                if i < header.count, !header[i].isEmpty {
                                    Text(ContentParser.renderMarkdown(header[i]))
                                        .font(TappyFont.footnote.weight(.semibold))
                                        .foregroundStyle(TappyColor.textSecondary)
                                }
                                Text(ContentParser.renderMarkdown(cell))
                                    .font(TappyFont.footnote)
                                    .foregroundStyle(TappyColor.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                .padding(Spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text("chat.table.label"))
        .accessibilityValue(Text("chat.table.size \(rows.count) \(columnCount)"))
    }

    private var grid: some View {
        HStack(alignment: .top, spacing: 0) {
            // The pinned column: the first cell of every row.
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                    cellView(row.first ?? "", isHeader: r == 0, width: pinnedWidth, row: r)
                }
            }
            .background(TappyColor.background)
            if columnCount > 1 {
                ScrollView(.horizontal, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                            HStack(alignment: .top, spacing: 0) {
                                ForEach(Array(row.dropFirst().enumerated()), id: \.offset) { _, cell in
                                    cellView(cell, isHeader: r == 0, width: columnWidth, row: r)
                                }
                            }
                        }
                    }
                }
            }
        }
        .onPreferenceChange(MarkdownRowHeightKey.self) { rowHeights = $0 }
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text("chat.table.label"))
        .accessibilityValue(Text("chat.table.size \(rows.count) \(columnCount)"))
    }

    private func cellView(_ cell: String, isHeader: Bool, width: CGFloat, row: Int) -> some View {
        Text(ContentParser.renderMarkdown(cell))
            .font(TappyFont.footnote.weight(isHeader ? .semibold : .regular))
            .foregroundStyle(TappyColor.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(Spacing.xs)
            // The cell reports its NATURAL height (measured before the row height is applied, so a row can grow when its text does).
            .background(GeometryReader { proxy in
                Color.clear.preference(key: MarkdownRowHeightKey.self, value: [row: proxy.size.height])
            })
            .frame(width: width, height: rowHeights[row], alignment: .topLeading)
            .background(isHeader ? TappyColor.surface : Color.clear)
            .border(TappyColor.border, width: 0.5)
    }
}

/// Each row's natural height, reported by its cells; the largest of a row's cells wins.
struct MarkdownRowHeightKey: PreferenceKey {
    static var defaultValue: [Int: CGFloat] = [:]
    static func reduce(value: inout [Int: CGFloat], nextValue: () -> [Int: CGFloat]) {
        for (row, height) in nextValue() { value[row] = max(value[row] ?? 0, height) }
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
