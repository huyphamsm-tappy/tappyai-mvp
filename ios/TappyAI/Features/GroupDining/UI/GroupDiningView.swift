import SwiftUI

/// Group dining — the native counterpart of the web's `/group/new` and Android's
/// `GroupDiningScreen`. Name a group, create it, get a link to send to everyone else.
struct GroupDiningView: View {
    @AppStateObject private var vm: GroupDiningViewModel
    @AppEnvironmentState private var router: AppRouter

    init(deps: AppDependencies) {
        _vm = AppStateObject(wrappedValue: GroupDiningViewModel(
            service: GroupService(api: deps.api),
            session: deps.session
        ))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("group.create.heading")
                        .font(TappyFont.title)
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("group.create.subtitle")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                }

                TappyCard {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("group.name.label")
                            .font(TappyFont.bodyEmphasis)
                            .foregroundStyle(TappyColor.textPrimary)
                        TappyTextField(
                            titleKey: "group.name.placeholder",
                            text: Binding(get: { vm.groupName }, set: { vm.groupName = $0 })
                        )

                        if !vm.canCreate {
                            // Signed out, or on an anonymous session. Both are "you need an
                            // account", and saying so here is better than a button that fails.
                            Text("group.signInRequired")
                                .font(TappyFont.caption)
                                .foregroundStyle(TappyColor.textSecondary)
                        }

                        if let message = vm.errorMessage {
                            Text(verbatim: message)
                                .font(TappyFont.caption)
                                .foregroundStyle(TappyColor.danger)
                        }

                        Button("group.create.button") { vm.createGroup() }
                            .buttonStyle(.tappy(.primary))
                            .disabled(!vm.isNameValid || vm.isCreating || !vm.canCreate)

                        if vm.isCreating {
                            TappyLoadingIndicator()
                        }
                    }
                }
            }
            .padding(Spacing.md)
        }
        .navigationTitle(Text("group.title"))
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: vm.createdGroupId) { newValue in
            guard let id = newValue else { return }
            router.push(ReviewsDestination.group(id: id))
            vm.consumeCreatedGroup()
        }
    }
}
