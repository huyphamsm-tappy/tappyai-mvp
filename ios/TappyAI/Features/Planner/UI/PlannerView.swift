import SwiftUI

/// AI Planner (web `/planner`, `PlannerView.tsx`): the plans found in the user's recent
/// conversations, each expandable in place and openable in its conversation.
struct PlannerView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter

    @State private var plans: [DerivedPlan] = []
    @State private var loading = true
    @State private var failed = false
    @State private var kind: PlanKind?
    @State private var expanded: Set<String> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text("planner.subtitle")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)

                if loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, Spacing.xl)
                } else if failed {
                    Text("planner.error")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.danger)
                } else if plans.isEmpty {
                    emptyState
                } else {
                    header
                    let shown = PlannerDerivation.filter(plans, kind: kind)
                    if shown.isEmpty {
                        Text("planner.emptyFiltered")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    ForEach(shown) { plan in
                        PlanCard(plan: plan, isExpanded: expanded.contains(plan.id),
                                 onToggle: { toggle(plan.id) },
                                 onOpen: { open(plan) })
                    }
                    Text("planner.scope")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
            .padding(Spacing.md)
        }
        .background(TappyColor.background)
        .navigationTitle(Text("planner.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack {
                Text("planner.listTitle").font(TappyFont.bodyEmphasis)
                Text(String(format: NSLocalizedString("planner.count", comment: ""), plans.count))
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
            }
            let facets = PlannerDerivation.facets(plans)
            if !facets.isEmpty {
                HStack(spacing: Spacing.xs) {
                    chip("planner.all", selected: kind == nil) { kind = nil }
                    ForEach(facets, id: \.self) { f in
                        chip(f == .trip ? "planner.travel" : "planner.evening", selected: kind == f) { kind = f }
                    }
                }
            }
        }
    }

    private func chip(_ key: LocalizedStringKey, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(key)
                .font(TappyFont.caption)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, Spacing.xxs)
                .background(selected ? TappyColor.primary : TappyColor.surface)
                .foregroundStyle(selected ? Color.white : TappyColor.textSecondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("planner.emptyTitle").font(TappyFont.bodyEmphasis)
            Text("planner.empty")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
            Button {
                // Planner has no composer of its own (web links to /chat?q=…): start a chat.
                router.popToRoot(on: .chat)
                router.switchTo(.chat)
            } label: {
                Text("planner.cta")
                    .font(TappyFont.callout)
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.xs)
                    .background(TappyColor.primary)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    private func toggle(_ id: String) {
        if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) }
    }

    private func open(_ plan: DerivedPlan) {
        // Same route the chat history uses to reopen a conversation.
        router.push(HomeDestination.conversation(id: plan.conversationId), on: .home)
        router.switchTo(.home)
    }

    private func load() async {
        loading = plans.isEmpty
        do {
            plans = PlannerDerivation.derivePlans(try await PlannerService(api: deps.api).conversations())
            failed = false
        } catch {
            failed = plans.isEmpty
        }
        loading = false
    }
}

private struct PlanCard: View {
    let plan: DerivedPlan
    let isExpanded: Bool
    let onToggle: () -> Void
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack(alignment: .top, spacing: Spacing.sm) {
                cover
                VStack(alignment: .leading, spacing: 2) {
                    Text(plan.title)
                        .font(TappyFont.bodyEmphasis)
                        .foregroundStyle(TappyColor.textPrimary)
                    Text(facts)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    if let when = plan.updatedAt {
                        Text(String(format: NSLocalizedString("planner.lastActivity", comment: ""),
                                    RelativeDateTimeFormatter().localizedString(for: when, relativeTo: Date())))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
            }
            if !isExpanded {
                Text(stopsPreview)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                    .lineLimit(2)
            } else {
                itinerary
            }
            HStack(spacing: Spacing.md) {
                Button(action: onToggle) {
                    Text(isExpanded ? "planner.collapse" : "planner.expand").font(TappyFont.caption)
                }
                Button(action: onOpen) {
                    Text("planner.open").font(TappyFont.caption)
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(TappyColor.primary)
        }
        .padding(Spacing.sm)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }

    @ViewBuilder private var cover: some View {
        if let raw = plan.coverUrl, let url = URL(string: raw) {
            AsyncImage(url: url) { $0.resizable().aspectRatio(contentMode: .fill) } placeholder: { TappyColor.surface }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        } else {
            Image(systemName: "calendar")
                .font(.system(size: 22))
                .foregroundStyle(TappyColor.textSecondary)
                .frame(width: 56, height: 56)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        }
    }

    private var facts: String {
        var parts = [String(format: NSLocalizedString("planner.days", comment: ""), plan.dayCount),
                     String(format: NSLocalizedString("planner.stops", comment: ""), plan.stopCount)]
        if let n = plan.people { parts.append(String(format: NSLocalizedString("planner.people", comment: ""), n)) }
        if let b = plan.budgetTotal { parts.append(String(format: NSLocalizedString("planner.budget", comment: ""), b)) }
        return parts.joined(separator: " · ")
    }

    private var stopsPreview: String {
        var line = plan.stops.map { [$0.emoji, $0.name].filter { !$0.isEmpty }.joined(separator: " ") }
            .joined(separator: " · ")
        let more = plan.stopCount - plan.stops.count
        if more > 0 { line += " " + String(format: NSLocalizedString("planner.more", comment: ""), more) }
        return line
    }

    private var itinerary: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            ForEach(Array(plan.plan.days.enumerated()), id: \.offset) { index, day in
                Text(day.label.isEmpty ? ShareArtifactBuilder.dayFallbackLabel(index + 1, lang: Locale.current.identifier) : day.label)
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
                ForEach(Array(day.items.enumerated()), id: \.offset) { _, item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text([item.time, item.emoji, item.name].filter { !$0.isEmpty }.joined(separator: " "))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textPrimary)
                        if let price = item.price {
                            Text(price).font(TappyFont.caption).foregroundStyle(TappyColor.primary)
                        }
                        if let d = item.description {
                            Text(d).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                        }
                        if let m = item.mapsLink, ShareArtifactBuilder.isSafeHttpsURL(m), let url = URL(string: m) {
                            Link(destination: url) { Text("planner.map").font(TappyFont.caption) }
                        }
                    }
                    .padding(.leading, Spacing.sm)
                }
            }
        }
    }
}
