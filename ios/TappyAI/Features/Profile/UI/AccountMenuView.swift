import SwiftUI

/// The list behind the hub's «Tài khoản» row — the same shape as «Cài đặt»: a short hub with the
/// rest one level down. Holds everything that used to be nine long rows on the hub.
struct AccountMenuView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @State private var showAppConnections = false

    private struct Item: Identifiable {
        let id: String
        let icon: String
        let label: LocalizedStringKey
        let desc: LocalizedStringKey
        let dest: ProfileDestination
    }

    private var items: [Item] {
        var rows = [
            Item(id: "info", icon: "person", label: "profile.row.account.desc", desc: "profile.row.account.menuDesc", dest: .account),
            Item(id: "bookings", icon: "calendar", label: "profile.row.bookings", desc: "profile.row.bookings.desc", dest: .bookings),
            Item(id: "prefs", icon: "heart", label: "profile.row.preferences", desc: "profile.row.preferences.desc", dest: .preferences),
            Item(id: "price", icon: "arrow.down.right", label: "profile.row.priceWatch", desc: "profile.row.priceWatch.desc", dest: .priceWatches),
            Item(id: "planner", icon: "map", label: "profile.row.planner", desc: "profile.row.planner.desc", dest: .planner),
            Item(id: "memory", icon: "brain", label: "profile.row.memory", desc: "profile.row.memory.desc", dest: .tappyKnows)
        ]
        if showAppConnections {
            rows.append(Item(id: "link", icon: "link", label: "profile.row.integrations", desc: "profile.row.integrations.desc", dest: .integrations))
        }
        rows.append(Item(id: "group", icon: "person.3", label: "profile.row.groupDining", desc: "profile.row.groupDining.desc", dest: .groupDining))
        return rows
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Divider().padding(.leading, 52) }
                    Button { router.push(item.dest, on: .profile) } label: {
                        HStack(spacing: Spacing.md) {
                            Image(systemName: item.icon)
                                .font(.system(size: 15))
                                .foregroundStyle(TappyColor.textSecondary)
                                .frame(width: 32, height: 32)
                                .background(TappyColor.surface)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.label).font(.system(size: 14, weight: .medium)).foregroundStyle(TappyColor.textPrimary)
                                Text(item.desc).font(.system(size: 11)).foregroundStyle(TappyColor.textSecondary).lineLimit(1)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .medium))
                                .foregroundStyle(TappyColor.textSecondary.opacity(0.5))
                        }
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, Spacing.sm)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("account-menu-\(item.id)")
                }
            }
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(TappyColor.border, lineWidth: 1))
            .padding(Spacing.md)
        }
        .background(TappyColor.background)
        .navigationTitle(Text("profile.row.account"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let cfg = try? await deps.configService.config() {
                showAppConnections = cfg.flags.showAppConnections ?? false
            }
        }
    }
}
