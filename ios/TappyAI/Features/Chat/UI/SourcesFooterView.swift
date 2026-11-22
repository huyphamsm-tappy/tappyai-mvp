import SwiftUI

/// "Nguồn · N" under a finished answer (web `SourcesFooter`, owner 28/10): a pill with a letter badge per site; a tap opens the list of pages the
/// answer used. Collapsed by default. Nothing is shown when the answer links to nothing.
struct SourcesFooterView: View {
    let sources: [AnswerSource]
    @State private var open = false

    var body: some View {
        if !sources.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Button { open.toggle() } label: {
                    HStack(spacing: 8) {
                        HStack(spacing: -6) {
                            ForEach(Array(AnswerSources.badgeLetters(sources).enumerated()), id: \.offset) { _, letter in
                                Text(letter).font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(TappyColor.textPrimary)
                                    .frame(width: 20, height: 20)
                                    .background(TappyColor.surface, in: Circle())
                                    .overlay(Circle().stroke(TappyColor.background, lineWidth: 2))
                            }
                        }
                        .accessibilityHidden(true)
                        Text(String(format: NSLocalizedString("chat.sources.title", comment: ""), sources.count))
                            .font(.system(size: 13)).foregroundStyle(TappyColor.textSecondary)
                        Image(systemName: open ? "chevron.up" : "chevron.down")
                            .font(.system(size: 10, weight: .semibold)).foregroundStyle(TappyColor.textSecondary)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .overlay(Capsule().stroke(TappyColor.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("answer-sources")
                if open {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(sources) { s in
                            (Text(LocalizedStringKey("[" + Self.escaped(s.label) + "](" + s.url.absoluteString + ")")) + Text(verbatim: " · " + s.host).foregroundColor(TappyColor.textSecondary))
                                .font(.system(size: 13))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .accessibilityIdentifier("answer-sources-list")
                }
            }
        }
    }

    /// A label goes into a markdown link, so its own brackets are escaped.
    static func escaped(_ label: String) -> String {
        label.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "[", with: "\\[")
            .replacingOccurrences(of: "]", with: "\\]")
    }
}
