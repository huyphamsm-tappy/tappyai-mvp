import SwiftUI

struct IntegrationsView: View {
    let deps: AppDependencies

    @State private var integrations: [Integration] = []
    @State private var loading = true

    private var service: ProfileService { ProfileService(api: deps.api) }

    private let integrationInfo: [(provider: String, name: String, desc: String, icon: String, whatTappyGets: String)] = [
        ("google_calendar", "Google Calendar", NSLocalizedString("integrations.calendar.desc", comment: ""), "📅",
         NSLocalizedString("integrations.calendar.scope", comment: "")),
        ("zalo", "Zalo", NSLocalizedString("integrations.zalo.desc", comment: ""), "💬",
         NSLocalizedString("integrations.zalo.scope", comment: "")),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                headerText
                privacyNote

                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                } else {
                    ForEach(integrationInfo, id: \.provider) { info in
                        integrationCard(info: info)
                    }
                    whatTappyDoesCard
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("integrations.title")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
    }

    // MARK: - Header

    private var headerText: some View {
        Text("integrations.intro")
            .font(.system(size: 13))
            .foregroundStyle(TappyColor.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Privacy Note

    private var privacyNote: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Text("🔒")
            Text("integrations.privacy")
                .font(.system(size: 11))
                .foregroundStyle(.indigo)
        }
        .padding(Spacing.md)
        .background(Color.indigo.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
    }

    // MARK: - Integration Card

    @ViewBuilder
    private func integrationCard(info: (provider: String, name: String, desc: String, icon: String, whatTappyGets: String)) -> some View {
        let connected = integrations.first(where: { $0.provider == info.provider })?.connected ?? false
        let meta = integrations.first(where: { $0.provider == info.provider })?.metadata

        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(alignment: .top, spacing: Spacing.md) {
                Text(info.icon)
                    .font(.system(size: 28))

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: Spacing.xs) {
                        Text(info.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(TappyColor.textPrimary)
                        if connected {
                            HStack(spacing: 3) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 9))
                                Text("integrations.connected")
                                    .font(.system(size: 10, weight: .medium))
                            }
                            .foregroundStyle(.green)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color.green.opacity(0.08))
                            .clipShape(Capsule())
                        }
                    }
                    Text(info.desc)
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.textSecondary)

                    if connected, let meta {
                        HStack(spacing: 6) {
                            if let pic = meta.picture, let url = URL(string: pic) {
                                AsyncImage(url: url) { img in
                                    img.resizable().aspectRatio(contentMode: .fill)
                                } placeholder: { Color.gray.opacity(0.2) }
                                .frame(width: 18, height: 18)
                                .clipShape(Circle())
                            }
                            Text(meta.email ?? meta.name ?? "")
                                .font(.system(size: 11))
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                        .padding(.top, 2)
                    }
                }
            }

            // What Tappy reads
            VStack(alignment: .leading, spacing: 3) {
                Text("integrations.readOnly")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
                Text(info.whatTappyGets)
                    .font(.system(size: 11))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .padding(Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(TappyColor.surface.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

            // Action
            if connected {
                Text("integrations.disconnect")
                    .font(.system(size: 11))
                    .foregroundStyle(.red.opacity(0.7))
            } else {
                Text("integrations.connect")
                    .font(.system(size: 11))
                    .foregroundStyle(TappyColor.primary)
            }
        }
        .padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - What Tappy Does

    private var whatTappyDoesCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("integrations.whatFor")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)

            VStack(alignment: .leading, spacing: 6) {
                usageRow("📅", NSLocalizedString("integrations.usage.calendar", comment: ""))
                usageRow("💬", NSLocalizedString("integrations.usage.zalo", comment: ""))
                usageRow("📊", NSLocalizedString("integrations.usage.behaviour", comment: ""))
            }
        }
        .padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func usageRow(_ emoji: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Text(emoji)
                .font(.system(size: 12))
            Text(text)
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)
        }
    }

    // MARK: - Data

    private func loadData() async {
        do {
            let resp = try await service.fetchIntegrations()
            integrations = resp.integrations
        } catch {}
        loading = false
    }
}
