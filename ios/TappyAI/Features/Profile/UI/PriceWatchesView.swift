import SwiftUI

struct PriceWatchesView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter

    @State private var watches: [PriceWatch] = []
    @State private var loading = true
    @State private var deleting: String?

    private var service: ProfileService { ProfileService(api: deps.api) }

    private var active: [PriceWatch] { watches.filter { $0.status == "active" } }
    private var triggered: [PriceWatch] { watches.filter { $0.status == "triggered" } }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                headerInfo
                howToAdd

                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                } else if watches.isEmpty {
                    emptyState
                } else {
                    if !active.isEmpty { activeSection }
                    if !triggered.isEmpty { triggeredSection }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("🎯 Theo dõi giá")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { Task { await loadData() } } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                .disabled(loading)
            }
        }
        .task { await loadData() }
    }

    // MARK: - Header

    private var headerInfo: some View {
        Text("Tappy báo bạn khi giá xuống mức mong muốn")
            .font(.system(size: 13))
            .foregroundStyle(TappyColor.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - How to add

    private var howToAdd: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("💬 Cách thêm sản phẩm")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(TappyColor.primary)
            Text("Nhắn Tappy: "Tappy theo dõi AirPods Pro, báo mình khi dưới 2 triệu"")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.primary.opacity(0.8))

            Button {
                router.popToRoot(on: .chat)
                router.switchTo(.chat)
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "bag").font(.system(size: 10))
                    Text("Nhắn Tappy ngay")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(TappyColor.primary)
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(TappyColor.primary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.primary.opacity(0.15), lineWidth: 1)
        )
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "arrow.down.right")
                .font(.system(size: 36))
                .foregroundStyle(TappyColor.textSecondary.opacity(0.4))
            Text("Chưa theo dõi sản phẩm nào")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(TappyColor.textSecondary)
            Text("Nhắn Tappy để thêm sản phẩm đầu tiên")
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
        }
        .padding(.top, 40)
    }

    // MARK: - Active Section

    private var activeSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: 4) {
                Image(systemName: "bell").font(.system(size: 10))
                Text("ĐANG THEO DÕI (\(active.count)/10)")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(TappyColor.textSecondary)
            .padding(.horizontal, 2)

            ForEach(active) { w in
                watchRow(w, triggered: false)
            }
        }
    }

    // MARK: - Triggered Section

    private var triggeredSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: 4) {
                Image(systemName: "bell.slash").font(.system(size: 10))
                Text("ĐÃ THÔNG BÁO (\(triggered.count))")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(TappyColor.textSecondary)
            .padding(.horizontal, 2)

            ForEach(triggered) { w in
                watchRow(w, triggered: true)
            }
        }
    }

    // MARK: - Watch Row

    @ViewBuilder
    private func watchRow(_ w: PriceWatch, triggered: Bool) -> some View {
        HStack(alignment: .top, spacing: Spacing.md) {
            Image(systemName: triggered ? "checkmark.circle.fill" : "arrow.down.right")
                .font(.system(size: 14))
                .foregroundStyle(triggered ? .green : TappyColor.primary)
                .frame(width: 36, height: 36)
                .background(triggered ? Color.green.opacity(0.08) : TappyColor.primary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

            VStack(alignment: .leading, spacing: 3) {
                Text(w.productName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textPrimary)
                    .lineLimit(1)
                if triggered {
                    Text("Đã xuống mức \(fmtVND(w.currentPrice ?? w.targetPrice))")
                        .font(.system(size: 11))
                        .foregroundStyle(.green)
                    if let notif = w.notifiedAt {
                        Text("Đã báo: \(fmtDateTime(notif))")
                            .font(.system(size: 10))
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                } else {
                    HStack(spacing: 4) {
                        Text("Mục tiêu:")
                            .font(.system(size: 11))
                            .foregroundStyle(TappyColor.textSecondary)
                        Text(fmtVND(w.targetPrice))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(TappyColor.primary)
                        if let cur = w.currentPrice {
                            Text("· Hiện tại: \(fmtVND(cur))")
                                .font(.system(size: 11))
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                    }
                    if let checked = w.lastChecked {
                        Text("Kiểm tra lần cuối: \(fmtDateTime(checked))")
                            .font(.system(size: 10))
                            .foregroundStyle(TappyColor.textSecondary)
                    } else {
                        Text("Tappy sẽ kiểm tra giá trong vài giờ tới ⏳")
                            .font(.system(size: 10))
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
            }

            Spacer()

            if !triggered {
                Button {
                    Task { await deleteWatch(w.id) }
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.textSecondary)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .disabled(deleting == w.id)
                .opacity(deleting == w.id ? 0.4 : 1)
            }
        }
        .padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
        .opacity(triggered ? 0.6 : 1)
    }

    // MARK: - Helpers

    private func fmtVND(_ n: Int) -> String {
        if n >= 1_000_000 {
            let m = Double(n) / 1_000_000
            return m.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(m)) triệu" : String(format: "%.1f triệu", m)
        }
        return "\(n / 1000)k"
    }

    private func fmtDateTime(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let d = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
        let df = DateFormatter()
        df.locale = Locale(identifier: "vi_VN")
        df.dateStyle = .short
        df.timeStyle = .short
        return df.string(from: d)
    }

    private func loadData() async {
        loading = true
        do {
            let resp = try await service.fetchPriceWatches()
            watches = resp.watches
        } catch {}
        loading = false
    }

    private func deleteWatch(_ id: String) async {
        deleting = id
        watches.removeAll { $0.id == id }
        try? await service.deletePriceWatch(id)
        deleting = nil
    }
}
