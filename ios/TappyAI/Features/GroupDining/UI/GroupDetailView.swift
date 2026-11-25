import SwiftUI

/// One group-dining room — the native counterpart of the web's `/group/[id]` and Android's
/// `GroupDetailScreen`.
///
/// Three things happen here, in the order people do them: share the link, fill in what you want to
/// eat, and — if you created the room — ask Tappy to pick somewhere that suits everyone.
struct GroupDetailView: View {
    @AppStateObject private var vm: GroupDetailViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmLeave = false
    @State private var confirmDelete = false
    @State private var confirmResuggest = false
    @Environment(\.openURL) private var openURL

    init(deps: AppDependencies, groupId: String) {
        _vm = AppStateObject(wrappedValue: GroupDetailViewModel(
            groupId: groupId,
            service: GroupService(api: deps.api, consent: deps.aiConsent),
            session: deps.session
        ))
    }

    var body: some View {
        Group {
            switch vm.state {
            case .loading:
                VStack(spacing: Spacing.md) {
                    TappySkeleton().frame(height: 80)
                    TappySkeleton().frame(height: 160)
                }
                .padding(Spacing.md)

            case .notFound:
                TappyEmptyState(
                    systemImage: "person.2.slash",
                    title: "group.notFound.title",
                    message: "group.notFound.message"
                )

            case .failed(let error):
                TappyErrorState(presentation: ErrorPresenter.present(error)) {
                    Task { await vm.load() }
                }

            case .loaded:
                loaded
            }
        }
        .navigationTitle(Text("group.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .onChange(of: vm.didExit) { gone in if gone { dismiss() } }
    }

    private var loaded: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                if vm.isPending {
                    // Only the name came back: the leader has not accepted this person yet.
                    Text(verbatim: vm.room?.name ?? "")
                        .font(TappyFont.title)
                        .foregroundStyle(TappyColor.textPrimary)
                    pendingCard
                } else {
                    heading
                    shareSection
                    requestsSection
                    membersSection
                    if vm.hasJoined || vm.canLeave || vm.isCreator {
                        if !vm.isCreator { joinedNotice }
                    } else {
                        joinForm
                    }
                    suggestionSection
                    if vm.canShowBill { GroupBillView(vm: vm) }
                    exitSection
                }
            }
            .padding(Spacing.md)
            .padding(.bottom, Spacing.xl)
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private var heading: some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(verbatim: vm.room?.name ?? "")
                .font(TappyFont.title)
                .foregroundStyle(TappyColor.textPrimary)
            // A count, not a list — "3 members joined". Pluralised through the catalogue so
            // English gets "member"/"members" and Vietnamese, which does not inflect, gets one
            // form rather than a bracketed "(s)".
            Text(String(
                format: NSLocalizedString(
                    vm.members.count == 1 ? "group.members.one" : "group.members.other",
                    comment: ""
                ),
                vm.members.count
            ))
            .font(TappyFont.callout)
            .foregroundStyle(TappyColor.textSecondary)
        }
    }

    @ViewBuilder
    private var shareSection: some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("group.share.label")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                Text(verbatim: vm.shareURL)
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                HStack(spacing: Spacing.sm) {
                    let copyKey = LocalizedStringKey(vm.linkCopied ? "group.share.copied" : "group.share.copy")
                    Button(copyKey) { vm.copyLink() }
                    .buttonStyle(.tappy(.secondary))

                    if let url = URL(string: vm.shareURL) {
                        ShareLink(item: url) {
                            Label("group.share.share", systemImage: "square.and.arrow.up")
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var membersSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("group.members.label")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            if vm.members.isEmpty {
                Text("group.members.empty")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
            } else {
                ForEach(vm.members) { member in
                    TappyCard {
                        VStack(alignment: .leading, spacing: Spacing.xxs) {
                            Text(verbatim: member.displayName)
                                .font(TappyFont.bodyEmphasis)
                                .foregroundStyle(TappyColor.textPrimary)
                            detail(icon: "banknote", value: member.budget)
                            detail(icon: "fork.knife", value: member.foodPreferences)
                            detail(icon: "nosign", value: member.dietaryRestrictions)
                            detail(icon: "mappin.and.ellipse", value: member.area)
                            // The leader can take someone out (member rows carry no account id, so no row is singled out).
                            if vm.isCreator {
                                Button("group.member.remove", role: .destructive) { vm.manage(member, .remove) }
                                    .font(TappyFont.caption)
                                    .disabled(vm.isWorking)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Suggestion cards and vote (G5–G6)

    /// The three real places, with the vote. The server counts and decides; this only draws.
    @ViewBuilder
    private var cardsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("group.suggestion.title")
                .font(TappyFont.headline)
                .foregroundStyle(TappyColor.textPrimary)

            if let chosen = vm.room?.chosenCard {
                TappyCard {
                    VStack(alignment: .leading, spacing: Spacing.xxs) {
                        Text("group.vote.chosen")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                        Text(verbatim: chosen.name)
                            .font(TappyFont.bodyEmphasis)
                            .foregroundStyle(TappyColor.textPrimary)
                    }
                }
            } else if let votes = vm.room?.votes {
                Text(String(format: NSLocalizedString("group.vote.progress", comment: ""), votes.voted, votes.participants))
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                if votes.isTie {
                    Text(LocalizedStringKey(vm.isCreator ? "group.vote.tieLeader" : "group.vote.tieWait"))
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }

            ForEach(vm.cards) { card in
                TappyCard {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: Spacing.xxs) {
                                Text(verbatim: card.name + (card.rating.map { " · ⭐ \(String(format: "%.1f", $0))" } ?? ""))
                                    .font(TappyFont.bodyEmphasis)
                                    .foregroundStyle(TappyColor.textPrimary)
                                if let address = card.address, !address.isEmpty {
                                    detail(icon: "mappin.and.ellipse", value: address)
                                }
                            }
                            Spacer(minLength: Spacing.xs)
                            Text(String(format: NSLocalizedString("group.vote.count", comment: ""), vm.votes(for: card)))
                                .font(TappyFont.caption)
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                        if let why = card.why, !why.isEmpty {
                            Text(verbatim: why)
                                .font(TappyFont.callout)
                                .foregroundStyle(TappyColor.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        // Opened only when it is a plain web address that passes the app's link guard.
                        if let link = card.mapsLink.flatMap({ safeWebURL($0) }) {
                            Button("group.vote.map") { openURL(link) }
                                .font(TappyFont.caption)
                        }
                        if vm.canVote {
                            Button(LocalizedStringKey(vm.isMyVote(card) ? "group.vote.mine" : "group.vote.button")) { vm.vote(card) }
                                .buttonStyle(.tappy(vm.isMyVote(card) ? .secondary : .primary))
                                .disabled(vm.isWorking)
                        }
                        if vm.canChoose {
                            Button("group.vote.choose") { vm.choose(card) }
                                .buttonStyle(.tappy(.secondary))
                                .disabled(vm.isWorking)
                        }
                    }
                }
            }
            if let message = vm.errorMessage {
                Text(verbatim: message)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.danger)
            }
        }
    }

    // MARK: - Pending, requests, leave and delete (G2–G4)

    @ViewBuilder
    private var pendingCard: some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("group.pending.title")
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)
                Text("group.pending.message")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
                if let message = vm.errorMessage {
                    Text(verbatim: message)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.danger)
                }
                Button("group.pending.withdraw") { vm.leave() }
                    .buttonStyle(.tappy(.secondary))
                    .disabled(vm.isWorking)
            }
        }
    }

    /// The leader's list of people asking to come in.
    @ViewBuilder
    private var requestsSection: some View {
        if vm.isCreator && !vm.pendingRequests.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("group.requests.label")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                ForEach(vm.pendingRequests) { person in
                    TappyCard {
                        VStack(alignment: .leading, spacing: Spacing.xs) {
                            Text(verbatim: person.displayName)
                                .font(TappyFont.bodyEmphasis)
                                .foregroundStyle(TappyColor.textPrimary)
                            detail(icon: "mappin.and.ellipse", value: person.area)
                            HStack(spacing: Spacing.sm) {
                                Button("group.requests.approve") { vm.manage(person, .approve) }
                                    .buttonStyle(.tappy(.primary))
                                Button("group.requests.decline") { vm.manage(person, .decline) }
                                    .buttonStyle(.tappy(.secondary))
                            }
                            .disabled(vm.isWorking)
                        }
                    }
                }
                if let message = vm.errorMessage {
                    Text(verbatim: message)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.danger)
                }
            }
        }
    }

    /// Leave (member) or delete (leader), each behind a confirmation.
    @ViewBuilder
    private var exitSection: some View {
        if vm.canLeave {
            Button("group.leave.button") { confirmLeave = true }
                .buttonStyle(.tappy(.secondary))
                .disabled(vm.isWorking)
                .confirmationDialog(Text("group.leave.confirm"), isPresented: $confirmLeave, titleVisibility: .visible) {
                    Button("group.leave.button", role: .destructive) { vm.leave() }
                    Button("common.cancel", role: .cancel) {}
                }
        }
        if vm.isCreator {
            Button("group.delete.button") { confirmDelete = true }
                .buttonStyle(.tappy(.secondary))
                .disabled(vm.isWorking)
                .confirmationDialog(Text("group.delete.confirm"), isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("group.delete.button", role: .destructive) { vm.deleteGroup() }
                    Button("common.cancel", role: .cancel) {}
                }
        }
    }

    @ViewBuilder
    private func detail(icon: String, value: String?) -> some View {
        if let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            HStack(spacing: Spacing.xxs) {
                Image(systemName: icon)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                Text(verbatim: value)
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
    }

    @ViewBuilder
    private var joinedNotice: some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text("group.joined.title")
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)
                Text("group.joined.waiting")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
    }

    @ViewBuilder
    private var joinForm: some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("group.join.title")
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)

                field(labelKey: "group.join.name", placeholder: "group.join.name.placeholder",
                      value: Binding(get: { vm.form.name }, set: { vm.form.name = $0 }))
                field(labelKey: "group.join.budget", placeholder: "group.join.budget.placeholder",
                      value: Binding(get: { vm.form.budget }, set: { vm.form.budget = $0 }))
                field(labelKey: "group.join.food", placeholder: "group.join.food.placeholder",
                      value: Binding(get: { vm.form.foodPreferences }, set: { vm.form.foodPreferences = $0 }))
                field(labelKey: "group.join.dietary", placeholder: "group.join.dietary.placeholder",
                      value: Binding(get: { vm.form.dietaryRestrictions }, set: { vm.form.dietaryRestrictions = $0 }))
                field(labelKey: "group.join.area", placeholder: "group.join.area.placeholder",
                      value: Binding(get: { vm.form.area }, set: { vm.form.area = $0 }))

                if vm.isFull {
                    Text("group.full")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.danger)
                }
                if !vm.isAuthenticated {
                    Text("group.signInRequired")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
                if let message = vm.errorMessage {
                    Text(verbatim: message)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.danger)
                }

                Button("group.join.button") { vm.join() }
                    .buttonStyle(.tappy(.primary))
                    .disabled(!vm.form.isValid || vm.isJoining || vm.isFull || !vm.isAuthenticated)

                if vm.isJoining { TappyLoadingIndicator() }
            }
        }
    }

    @ViewBuilder
    private func field(labelKey: String, placeholder: String, value: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(LocalizedStringKey(labelKey))
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
            TappyTextField(titleKey: LocalizedStringKey(placeholder), text: value)
        }
    }

    @ViewBuilder
    private var suggestionSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            if vm.hasCards { cardsSection }
            if !vm.hasCards, let suggestion = vm.room?.suggestion, !suggestion.isEmpty {
                TappyCard {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("group.suggestion.title")
                            .font(TappyFont.bodyEmphasis)
                            .foregroundStyle(TappyColor.textPrimary)
                        Text(verbatim: suggestion)
                            .font(TappyFont.body)
                            .foregroundStyle(TappyColor.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            // Creator-only, and hidden rather than disabled for everyone else: a member is not
            // "not allowed yet", they are simply not the person who asks.
            if vm.isCreator {
                // With cards on screen the same call is "suggest again", which clears the votes and the decision.
                Button(LocalizedStringKey(vm.hasCards ? "group.resuggest.button" : "group.suggest.button")) {
                    if vm.hasCards { confirmResuggest = true } else { vm.requestSuggestion() }
                }
                .buttonStyle(.tappy(vm.hasCards ? .secondary : .primary))
                .disabled(!vm.canSuggest)
                .confirmationDialog(Text("group.resuggest.confirm"), isPresented: $confirmResuggest, titleVisibility: .visible) {
                    Button("group.resuggest.button", role: .destructive) { vm.requestSuggestion() }
                    Button("common.cancel", role: .cancel) {}
                }
                if vm.isSuggesting {
                    HStack(spacing: Spacing.xs) {
                        TappyLoadingIndicator()
                        Text("group.suggest.working")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
            }
        }
    }
}
