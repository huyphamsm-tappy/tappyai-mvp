import SwiftUI

/// Settings → Tài khoản đã chặn. Lists whom the signed-in person has blocked, with «Bỏ chặn». The list
/// endpoint returns ids only, so each name comes from the public profile; a profile that no longer loads
/// (deleted account) still gets its row, with a neutral name, so it can be unblocked.
struct BlockedAccountsView: View {
    let deps: AppDependencies
    @ObservedObject private var safety: SafetyStore

    @State private var names: [String: String] = [:]
    @State private var loading = true
    @State private var failedIds: Set<String> = []

    init(deps: AppDependencies) {
        self.deps = deps
        _safety = ObservedObject(wrappedValue: deps.safety)
    }

    private var ids: [String] { safety.blockedIds.sorted() }

    var body: some View {
        Group {
            if loading && ids.isEmpty {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if ids.isEmpty {
                TappyEmptyState(systemImage: "hand.raised", title: "safety.blocked.emptyTitle", message: "safety.blocked.emptyMessage")
                    .accessibilityIdentifier("blocked-empty")
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("safety.blocked.intro").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                        VStack(spacing: 0) {
                            ForEach(ids, id: \.self) { id in
                                row(id)
                                if id != ids.last { Divider().padding(.leading, 60) }
                            }
                        }
                        .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .padding(16)
                }
            }
        }
        .background(TappyColor.background)
        .navigationTitle(Text("safety.blocked.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await safety.refresh()
            loading = false
            await loadNames()
        }
    }

    private func row(_ id: String) -> some View {
        HStack(spacing: 12) {
            Circle().fill(TappyColor.primary.opacity(0.15)).frame(width: 40, height: 40)
                .overlay(Text(initial(id)).font(.system(size: 16, weight: .bold)).foregroundStyle(TappyColor.primary))
            Text(names[id] ?? NSLocalizedString("safety.block.thisPerson", comment: ""))
                .font(TappyFont.callout.weight(.medium)).foregroundStyle(TappyColor.textPrimary).lineLimit(1)
                .accessibilityIdentifier("blocked-name-" + id)
            Spacer()
            Button { Task { _ = await safety.unblock(id) } } label: {
                Text("safety.block.unblock").font(TappyFont.caption.weight(.semibold)).foregroundStyle(TappyColor.primary)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .overlay(Capsule().stroke(TappyColor.primary, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("blocked-unblock-" + id)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    private func initial(_ id: String) -> String {
        String((names[id] ?? "?").prefix(1)).uppercased()
    }

    private func loadNames() async {
        let service = ReviewsService(api: deps.api)
        for id in ids where names[id] == nil && !failedIds.contains(id) {
            if let profile = try? await service.fetchUserProfile(userId: id) {
                names[id] = profile.displayName
            } else {
                failedIds.insert(id)
            }
        }
    }
}
