import SwiftUI

struct DealsView: View {
    @AppStateObject private var vm: DealsViewModel
    @AppEnvironmentState private var localization: LocalizationManager

    init(deps: AppDependencies) {
        _vm = AppStateObject(wrappedValue: DealsViewModel(service: DealsService(api: deps.api)))
    }

    var body: some View {
        Group {
            switch vm.state {
            case .idle, .loading:
                ScrollView {
                    VStack(spacing: Spacing.md) {
                        ForEach(0..<4, id: \.self) { _ in
                            TappySkeleton().frame(height: 96)
                        }
                    }
                    .padding(Spacing.md)
                }
            case .failed:
                TappyErrorState(
                    presentation: .init(title: "Không tải được", message: "Thử lại sau.", retryable: true),
                    onRetry: { Task { await vm.load(lang: localization.language.rawValue) } }
                )
                .padding(.top, 60)
            case .loaded:
                if vm.deals.isEmpty {
                    TappyEmptyState(systemImage: "tag", title: "Chưa có ưu đãi nào")
                        .padding(.top, 60)
                } else {
                    list
                }
            }
        }
        .background(TappyColor.background)
        .navigationTitle("Ưu đãi")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(lang: localization.language.rawValue) }
        .refreshable { await vm.load(lang: localization.language.rawValue) }
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: Spacing.sm) {
                ForEach(vm.deals) { deal in
                    dealCard(deal)
                }
            }
            .padding(Spacing.md)
        }
    }

    @ViewBuilder
    private func dealCard(_ deal: PartnerDeal) -> some View {
        Button { open(deal) } label: {
            HStack(spacing: Spacing.md) {
                logo(deal)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: Spacing.xs) {
                        Text(deal.partnerName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(TappyColor.textPrimary)
                        categoryBadge(deal.categoryKey, label: deal.category)
                        if deal.isFeatured {
                            Text("⭐")
                                .font(.system(size: 11))
                        }
                    }
                    Text(deal.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(TappyColor.textPrimary)
                        .lineLimit(2)
                    if let discount = deal.discountLabel {
                        Text(discount)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(TappyColor.danger)
                    }
                    if let code = deal.voucherCode {
                        Text("Mã: \(code)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(TappyColor.primary)
                    }
                }
                Spacer()
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 16))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .padding(Spacing.md)
        }
        .buttonStyle(.plain)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(TappyColor.border, lineWidth: 1))
    }

    @ViewBuilder
    private func logo(_ deal: PartnerDeal) -> some View {
        Group {
            if let url = deal.logoImage, let imageURL = URL(string: url) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image): image.resizable().aspectRatio(contentMode: .fit).padding(8)
                    default: fallbackLogo(deal)
                    }
                }
            } else {
                fallbackLogo(deal)
            }
        }
        .frame(width: 48, height: 48)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    }

    private func fallbackLogo(_ deal: PartnerDeal) -> some View {
        Text(String(deal.partnerName.prefix(1)).uppercased())
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(TappyColor.primary)
    }

    /// Deterministic color keyed on `categoryKey` (never `category`) so a badge's color stays
    /// stable across a language switch — the Deals-specific instance of the same class of bug
    /// Android hit and fixed for its category→color mapping (Production Knowledge Base §10).
    @ViewBuilder
    private func categoryBadge(_ key: String, label: String) -> some View {
        let color = Self.color(for: key)
        Text(label)
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private static let palette: [Color] = [.orange, .blue, .purple, .green, .pink, .indigo, .teal, .brown]

    private static func color(for categoryKey: String) -> Color {
        let hash = categoryKey.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return palette[hash % palette.count]
    }

    private func open(_ deal: PartnerDeal) {
        vm.openDeal(deal)
        guard let url = URL(string: deal.officialUrl) else { return }
        UIApplication.shared.open(url)
    }
}
