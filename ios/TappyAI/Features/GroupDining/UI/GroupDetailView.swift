import SwiftUI

/// One group-dining room — the native counterpart of the web's `/group/[id]` and Android's
/// `GroupDetailScreen`.
///
/// Three things happen here, in the order people do them: share the link, fill in what you want to
/// eat, and — if you created the room — ask Tappy to pick somewhere that suits everyone.
struct GroupDetailView: View {
    @AppStateObject private var vm: GroupDetailViewModel

    init(deps: AppDependencies, groupId: String) {
        _vm = AppStateObject(wrappedValue: GroupDetailViewModel(
            groupId: groupId,
            service: GroupService(api: deps.api),
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
    }

    private var loaded: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                heading
                shareSection
                membersSection
                if vm.hasJoined {
                    joinedNotice
                } else {
                    joinForm
                }
                suggestionSection
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
                        }
                    }
                }
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
            if let suggestion = vm.room?.suggestion, !suggestion.isEmpty {
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
                Button("group.suggest.button") { vm.requestSuggestion() }
                    .buttonStyle(.tappy(.primary))
                    .disabled(!vm.canSuggest)
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
