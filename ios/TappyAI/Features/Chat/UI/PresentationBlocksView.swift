import SwiftUI

/// Draws the blocks the model declared with the answer (web `PresentationBlocks.tsx`, layout slice 3, 14/11/2026): a comparison table, one card per
/// named subject, tap-to-send questions and a booking handoff. VIEW ONLY: the words are the model's plain text, a booking is a link the server's
/// partner layer produced for the tool result it points at, and this view never builds an address.
struct PresentationBlocksView: View {
    let frame: PresentationFrame
    /// Sends a tapped option as the person's next message.
    var onSend: (String) -> Void = { _ in }
    /// An older answer: its options send nothing.
    var disabled = false
    /// Pictures the server found for the subjects, by `SubjectImages.key(name)` (a card without one has no picture).
    var subjectImages: [String: URL] = [:]
    /// Pictures the server found for a declared gallery, by `SubjectImages.key(caption)`.
    var galleryImages: [String: URL] = [:]

    @State private var sent: String?

    private var locked: Bool { disabled || sent != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            ForEach(frame.blocks) { block in
                switch block {
                case .compare(_, let title, let columns, let rows, let pick):
                    CompareTableView(title: title, columns: columns, rows: rows, pick: pick)
                case .profiles(_, let title, let items):
                    ProfileCardsView(title: title, items: items, images: subjectImages)
                case .gallery(_, let title, let items):
                    GalleryBlockView(title: title, items: items, images: galleryImages)
                case .ask(_, let questions):
                    askView(questions)
                case .booking(let id, let kind, let title, let detail, _, _):
                    if let link = frame.links[id] { BookingCardView(kind: kind, title: title, detail: detail, link: link) }
                }
            }
        }
        .accessibilityIdentifier("chat-presentation")
    }

    private func askView(_ questions: [PresentationBlock.AskQuestion]) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            ForEach(Array(questions.enumerated()), id: \.offset) { _, q in
                VStack(alignment: .leading, spacing: 6) {
                    Text(q.text).font(TappyFont.callout.weight(.medium)).foregroundStyle(TappyColor.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    ChatFlowLayout(spacing: Spacing.xs) {
                        ForEach(q.options, id: \.self) { option in
                            Button {
                                guard !locked else { return }
                                sent = option
                                onSend(option)
                            } label: {
                                Text(option)
                                    .font(TappyFont.caption.weight(.medium))
                                    .foregroundStyle(TappyColor.textPrimary)
                                    .padding(.horizontal, Spacing.sm).padding(.vertical, 6)
                                    .background(sent == option ? TappyColor.primary.opacity(0.2) : TappyColor.surface, in: Capsule())
                                    .overlay(Capsule().stroke(TappyColor.border, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .disabled(locked)
                            .opacity(locked && sent != option ? 0.6 : 1)
                            .minimumTapTarget()
                            .accessibilityIdentifier("present-ask-option")
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Comparison table

private struct CompareTableView: View {
    let title: String?
    let columns: [String]
    let rows: [PresentationBlock.CompareRow]
    let pick: Int?

    private let labelWidth: CGFloat = 96
    private let cellWidth: CGFloat = 138

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title {
                Text(title).font(TappyFont.callout.weight(.semibold)).foregroundStyle(TappyColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .bottom, spacing: 0) {
                        Color.clear.frame(width: labelWidth, height: 1)
                        ForEach(Array(columns.enumerated()), id: \.offset) { i, column in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(column).font(TappyFont.footnote.weight(.semibold)).foregroundStyle(TappyColor.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                                if pick == i {
                                    Text("chat.present.pick").font(.system(size: 11, weight: .medium)).foregroundStyle(Color(hex: 0x059669))
                                }
                            }
                            .padding(8)
                            .frame(width: cellWidth, alignment: .leading)
                            .background(pick == i ? Color(hex: 0x059669, alpha: 0.12) : Color.clear)
                        }
                    }
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        Divider().overlay(TappyColor.separator)
                        HStack(alignment: .top, spacing: 0) {
                            Text(row.label).font(TappyFont.caption.weight(.medium)).foregroundStyle(TappyColor.textSecondary)
                                .padding(8).frame(width: labelWidth, alignment: .leading)
                            ForEach(Array(row.cells.enumerated()), id: \.offset) { i, cell in
                                Text(cell).font(TappyFont.footnote).foregroundStyle(TappyColor.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .padding(8).frame(width: cellWidth, alignment: .leading)
                                    .background(pick == i ? Color(hex: 0x059669, alpha: 0.06) : Color.clear)
                            }
                        }
                    }
                }
            }
        }
        .padding(Spacing.xs)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityIdentifier("present-compare")
    }
}

// MARK: - Subject cards

private struct ProfileCardsView: View {
    let title: String?
    let items: [PresentationBlock.ProfileItem]
    let images: [String: URL]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            if let title {
                Text(title).font(TappyFont.callout.weight(.semibold)).foregroundStyle(TappyColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            if PresentationRules.profilesAsTable(items) {
                // Three or more subjects with one point each: a two-column table (subject | point), as web draws it.
                profileTable
            } else {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    card(item)
                }
            }
        }
        .accessibilityIdentifier("present-profiles")
    }

    private var profileTable: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                if i > 0 { Divider().overlay(TappyColor.separator) }
                HStack(alignment: .top, spacing: Spacing.sm) {
                    Text(item.name).font(TappyFont.footnote.weight(.semibold)).foregroundStyle(TappyColor.textPrimary)
                        .frame(width: 110, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                    if let point = item.points.first {
                        Text(verbatim: (point.lead.map { $0 + ": " } ?? "") + point.text)
                            .font(TappyFont.footnote).foregroundStyle(TappyColor.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(Spacing.xs)
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityIdentifier("present-profile-table")
    }

    /// One subject: the picture 104 pt on the left when the server found one (none when it did not), the name and the rest on the right.
    private func card(_ item: PresentationBlock.ProfileItem) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            if let url = images[SubjectImages.key(item.name)] {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { Rectangle().fill(TappyColor.textSecondary.opacity(0.15)) }
                }
                .frame(width: 104, height: 104).clipped()
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(item.name).font(TappyFont.headline).foregroundStyle(TappyColor.textPrimary)
                if let subtitle = item.subtitle {
                    Text(subtitle).font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
                }
                ForEach(Array(item.points.enumerated()), id: \.offset) { _, point in
                    Group {
                        if let lead = point.lead { Text(verbatim: lead + ": ").bold() + Text(verbatim: point.text) } else { Text(verbatim: point.text) }
                    }
                    .font(TappyFont.footnote).foregroundStyle(TappyColor.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                }
                if !item.sources.isEmpty {
                    Text(String(format: NSLocalizedString("chat.present.sources", comment: ""), item.sources.joined(separator: ", ")))
                        .font(.system(size: 11)).foregroundStyle(TappyColor.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("present-profile-card")
    }
}

// MARK: - Gallery

/// Two or three pictures of what the answer is about. A shot is drawn only when the server found its picture (web: a gallery with no picture
/// draws nothing, the card never carries an address of its own).
private struct GalleryBlockView: View {
    let title: String?
    let items: [PresentationBlock.GalleryItem]
    let images: [String: URL]

    private var shots: [(caption: String, url: URL)] {
        items.compactMap { item in images[SubjectImages.key(item.caption)].map { (item.caption, $0) } }
    }

    var body: some View {
        // Layout by how many pictures were found (spec §3.3): one wide picture, two side by side, or three as one large and two small.
        let layout = PresentationRules.galleryLayout(pictures: shots.count)
        if layout != .none {
            VStack(alignment: .leading, spacing: 6) {
                if let title {
                    Text(title).font(TappyFont.callout.weight(.semibold)).foregroundStyle(TappyColor.textPrimary)
                }
                switch layout {
                case .wide:
                    shotView(shots[0], height: 180)
                case .pair:
                    HStack(alignment: .top, spacing: Spacing.xs) {
                        shotView(shots[0], height: 150)
                        shotView(shots[1], height: 150)
                    }
                case .trio:
                    HStack(alignment: .top, spacing: Spacing.xs) {
                        shotView(shots[0], height: 210)
                        VStack(spacing: Spacing.xs) {
                            shotView(shots[1], height: 101)
                            shotView(shots[2], height: 101)
                        }
                    }
                case .none:
                    EmptyView()
                }
            }
            .accessibilityIdentifier("present-gallery")
        }
    }

    private func shotView(_ shot: (caption: String, url: URL), height: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            AsyncImage(url: shot.url) { phase in
                if let image = phase.image { image.resizable().scaledToFill() } else { Rectangle().fill(TappyColor.textSecondary.opacity(0.15)) }
            }
            .frame(maxWidth: .infinity).frame(height: height).clipped()
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            Text(shot.caption).font(.system(size: 11)).foregroundStyle(TappyColor.textSecondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: shot.caption))
    }
}

// MARK: - Booking handoff

private struct BookingCardView: View {
    let kind: PresentationBlock.BookingKind
    let title: String
    let detail: String?
    let link: PresentationBookingLink

    var body: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: Self.symbol(kind))
                .font(.system(size: 18)).foregroundStyle(Color(hex: 0xD97706))
                .frame(width: 40, height: 40)
                .background(Color(hex: 0xF59E0B, alpha: 0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(TappyFont.callout.weight(.semibold)).foregroundStyle(TappyColor.textPrimary).lineLimit(2)
                if let detail { Text(detail).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary).lineLimit(2) }
                if link.handoff == "merchant_login" {
                    Text("chat.present.login").font(.system(size: 11)).foregroundStyle(Color(hex: 0xB45309))
                }
                if link.handoff == "app" {
                    Text("chat.present.app").font(.system(size: 11)).foregroundStyle(Color(hex: 0xB45309))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Link(destination: link.url) {
                HStack(spacing: 4) {
                    Text(String(format: NSLocalizedString("chat.present.book", comment: ""), link.label))
                        .font(.system(size: 12, weight: .bold))
                    Image(systemName: "arrow.up.right.square").font(.system(size: 12))
                }
                .foregroundStyle(Color.black)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Color(hex: 0xFBBF24), in: Capsule())
            }
            .accessibilityIdentifier("present-booking-link")
        }
        .padding(Spacing.sm)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityIdentifier("present-booking")
    }

    static func symbol(_ kind: PresentationBlock.BookingKind) -> String {
        switch kind {
        case .flight: return "airplane"
        case .hotel: return "bed.double.fill"
        case .transport: return "bus.fill"
        case .ticket: return "ticket.fill"
        case .activity: return "sparkles"
        case .product: return "bag.fill"
        }
    }
}
