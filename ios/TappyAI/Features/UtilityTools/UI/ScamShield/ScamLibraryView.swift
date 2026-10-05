import SwiftUI

/// The Web's scam-reporting hotline (`SCAM_REPORT_HOTLINE` in `src/lib/scam-shield/hotline.ts`, Web final a43948d): the number
/// shown to the person and the `tel:` URI. Source cited by the Web: Cục Cảnh sát hình sự - Bộ Công an,
/// https://bocongan.gov.vn/hoi-dap/chi-tiet-cau-hoi/ab7d473e-21c9-4950-8ae2-947c1c7605af?page=/ (the page lists this number).
enum ScamReportHotline {
    static let display = "0692.345.860"
    static let tel = "tel:0692345860"
}

/// The fixed emergency block: always on the Scam Shield screen, whatever tab is open.
struct ScamEmergencyCard: View {
    var body: some View {
        // Two rows, as the Web card ("call" button under the text): the hotline label «Gọi 0692.345.860» is too long to share a
        // row with the text, and beside it the number was cut across three lines (CI run 37258782135, shot 07).
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "phone.fill")
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(TappyColor.danger)
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("scam.emergency.title").font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                    Text("scam.emergency.body").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                }
                Spacer(minLength: 0)
            }
            // The identifier below keeps its old name: UI tests address the button by it.
            if let url = URL(string: ScamReportHotline.tel) {
                Link(destination: url) {
                    Text("scam.emergency.call")
                        .font(TappyFont.bodyEmphasis).foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, Spacing.md).padding(.vertical, Spacing.xs)
                        .background(TappyColor.danger).clipShape(Capsule())
                }
                .accessibilityIdentifier("scam-call-113")
            }
        }
        .padding(Spacing.md)
        .background(TappyColor.danger.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).stroke(TappyColor.danger.opacity(0.3), lineWidth: 1))
    }
}

/// The source block: shown at the top of the library and on EVERY scenario, so the origin of a warning is never missing.
struct ScamSourceBlock: View {
    let source: KnowledgeSource
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack(spacing: Spacing.xs) {
                Image(systemName: "checkmark.seal.fill").foregroundStyle(TappyColor.primary)
                Text("scam.lib.source").font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
            }
            if let date = ScamKnowledge.displayDate(source.publishedAt) {
                Text(String(format: NSLocalizedString("scam.lib.published", comment: ""), date))
                    .font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            }
            if !source.title.isEmpty {
                Text(source.title).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            }
            if let url = ScamKnowledge.officialURL(source.url) {
                Link(destination: url) {
                    Label { Text("scam.lib.readOriginal") } icon: { Image(systemName: "arrow.up.right.square") }
                        .font(TappyFont.callout)
                }
                .accessibilityIdentifier("scam-read-original")
            }
            Text("scam.lib.notGov").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TappyColor.primary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }
}

/// «Tình huống lừa đảo»: the 25 scenarios, grouped by the authority's five groups.
struct ScamLibraryView: View {
    let knowledge: ScamKnowledge

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            ScamSourceBlock(source: knowledge.source)
            ForEach(knowledge.groups) { group in
                let items = knowledge.scenarios(in: group.category)
                if !items.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text(group.label).font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                        VStack(spacing: 0) {
                            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                                if index > 0 { Divider().padding(.leading, Spacing.md) }
                                NavigationLink {
                                    ScamScenarioDetailView(scenario: item, advice: knowledge.official)
                                } label: {
                                    HStack(alignment: .top, spacing: Spacing.sm) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(item.official.title).font(.system(size: 14, weight: .medium))
                                                .foregroundStyle(TappyColor.textPrimary).multilineTextAlignment(.leading)
                                            Text(item.official.summary).font(.system(size: 12))
                                                .foregroundStyle(TappyColor.textSecondary).lineLimit(2).multilineTextAlignment(.leading)
                                        }
                                        Spacer(minLength: 0)
                                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .medium))
                                            .foregroundStyle(TappyColor.textSecondary.opacity(0.5))
                                    }
                                    .padding(Spacing.md)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("scam-scenario-\(item.officialNumber)")
                            }
                        }
                        .background(TappyColor.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
                    }
                }
            }
        }
    }
}

struct ScamScenarioDetailView: View {
    let scenario: ScamScenario
    let advice: KnowledgeAdvice

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                // The official half: as published.
                Text(scenario.official.title).font(TappyFont.title).foregroundStyle(TappyColor.textPrimary)
                Text(scenario.official.summary).font(TappyFont.body).foregroundStyle(TappyColor.textPrimary)
                ScamSourceBlock(source: scenario.source)

                // TappyAI's half: labelled as ours.
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("scam.lib.tappyGuidance").font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                    Text("scam.lib.tappyGuidance.note").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                }
                list("scam.lib.warningSigns", scenario.guidance.warningSigns, "exclamationmark.triangle.fill", TappyColor.secondary)
                list("scam.lib.commonRequests", scenario.guidance.commonRequests, "text.bubble.fill", TappyColor.textSecondary)
                list("scam.lib.whatToDo", scenario.guidance.whatToDo, "checkmark.circle.fill", Color.green)
                list("scam.lib.whatNotToDo", scenario.guidance.whatNotToDo, "xmark.circle.fill", TappyColor.danger)

                ScamEmergencyCard()
                if !advice.reportAdvice.isEmpty {
                    Text(advice.reportAdvice).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                }
            }
            .padding(Spacing.md)
        }
        .background(TappyColor.background)
        .navigationTitle(Text("scam.lib.title"))
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func list(_ titleKey: LocalizedStringKey, _ items: [String], _ icon: String, _ tint: Color) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(titleKey).font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: Spacing.xs) {
                        Image(systemName: icon).font(.system(size: 13)).foregroundStyle(tint).padding(.top, 2)
                        Text(item).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                    }
                }
            }
        }
    }
}
