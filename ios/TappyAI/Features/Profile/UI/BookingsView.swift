import SwiftUI

struct BookingsView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter

    @State private var bookings: [ProfileBooking] = []
    @State private var loading = true
    @State private var reviewEligible: Set<String> = []
    @State private var reviewTarget: ProfileBooking?

    private var service: ProfileService { ProfileService(api: deps.api) }

    private let serviceEmoji: [String: String] = [
        "food": "🍜", "spa": "💆", "hotel": "🏨", "travel": "✈️",
        "shopping": "🛍️", "entertainment": "🎉",
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if bookings.isEmpty {
                    emptyState
                } else {
                    pendingBanner
                    ForEach(bookings) { booking in
                        bookingCard(booking)
                    }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Lịch đặt chỗ")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadBookings() }
        .sheet(item: $reviewTarget) { booking in
            CreateReviewView(deps: deps, prefilledPlaceId: booking.placeId, prefilledPlaceName: booking.serviceName)
        }
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Text("📅")
                .font(.system(size: 48))
            Text("Chưa có lịch đặt chỗ nào")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text("Dùng chat để tìm nhà hàng, spa, khách sạn và đặt chỗ ngay!")
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.lg)

            Button {
                router.popToRoot(on: .home)
                router.switchTo(.home)
            } label: {
                HStack(spacing: 4) {
                    Text("Khám phá ngay")
                        .font(.system(size: 13, weight: .semibold))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, 10)
                .background(TappyColor.primary)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 60)
    }

    // MARK: - Pending Banner

    @ViewBuilder
    private var pendingBanner: some View {
        if bookings.contains(where: { $0.status == "pending" }) {
            HStack(spacing: Spacing.sm) {
                Text("⏳")
                Text("Đang xử lý — TappyAI đã ghi nhận đặt chỗ. Cơ sở sẽ liên hệ xác nhận qua SĐT bạn đã cung cấp.")
                    .font(.system(size: 11))
                    .foregroundStyle(.orange)
            }
            .padding(Spacing.md)
            .background(Color.orange.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(Color.orange.opacity(0.2), lineWidth: 1)
            )
        }
    }

    // MARK: - Booking Card

    @ViewBuilder
    private func bookingCard(_ b: ProfileBooking) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(alignment: .top, spacing: Spacing.sm) {
                Text(serviceEmoji[b.serviceType] ?? "📍")
                    .font(.system(size: 22))
                VStack(alignment: .leading, spacing: 3) {
                    Text(b.serviceName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(TappyColor.textPrimary)
                        .lineLimit(1)
                    Text("\(b.customerName) · \(b.customerPhone)")
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                Spacer()
                statusBadge(b.status)
            }
            .padding(Spacing.md)

            // Details
            HStack(spacing: Spacing.md) {
                HStack(spacing: 4) {
                    Image(systemName: "calendar")
                        .font(.system(size: 10))
                    Text(formatDate(b.date))
                        .font(.system(size: 11))
                }
                if let time = b.time, !time.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.system(size: 10))
                        Text(time)
                            .font(.system(size: 11))
                    }
                }
                if b.guests > 1 {
                    HStack(spacing: 4) {
                        Image(systemName: "person.2")
                            .font(.system(size: 10))
                        Text("\(b.guests) người")
                            .font(.system(size: 11))
                    }
                }
            }
            .foregroundStyle(TappyColor.textSecondary)
            .padding(.horizontal, Spacing.md)
            .padding(.bottom, Spacing.sm)

            // Notes
            if let notes = b.notes, !notes.isEmpty {
                Text(""\(notes)"")
                    .font(.system(size: 11))
                    .foregroundStyle(TappyColor.textSecondary)
                    .italic()
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(TappyColor.surface)
                    .padding(.horizontal, Spacing.md)
                    .padding(.bottom, Spacing.sm)
            }

            // Share / Review
            Divider()
            HStack(spacing: 0) {
                ShareLink(item: shareText(b)) {
                    HStack(spacing: 4) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 12))
                        Text("Chia sẻ")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(TappyColor.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.sm)
                }
                if reviewEligible.contains(b.id) {
                    Divider()
                    Button {
                        reviewTarget = b
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "star")
                                .font(.system(size: 12))
                            Text("Đánh giá")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Status Badge

    @ViewBuilder
    private func statusBadge(_ status: String) -> some View {
        let (text, color): (String, Color) = {
            switch status {
            case "confirmed": return ("✅ Đã xác nhận", .green)
            case "cancelled": return ("❌ Đã hủy", .red)
            default: return ("⏳ Đang xử lý", .orange)
            }
        }()
        Text(text)
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(color)
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 4)
            .background(color.opacity(0.08))
            .clipShape(Capsule())
    }

    // MARK: - Helpers

    private func formatDate(_ dateStr: String) -> String {
        let parts = dateStr.split(separator: "-")
        guard parts.count == 3 else { return dateStr }
        return "\(parts[2])/\(parts[1])/\(parts[0])"
    }

    private func shareText(_ b: ProfileBooking) -> String {
        [
            "📋 Xác nhận đặt chỗ — TappyAI",
            "🏠 \(b.serviceName)",
            "📅 Ngày: \(formatDate(b.date))\(b.time.map { " lúc \($0)" } ?? "")",
            "👤 \(b.customerName) | 📞 \(b.customerPhone)",
            b.guests > 1 ? "👥 Số khách: \(b.guests)" : nil,
            b.notes.map { "📝 \($0)" },
        ].compactMap { $0 }.joined(separator: "\n")
    }

    private func loadBookings() async {
        do {
            bookings = try await service.fetchBookings()
            await computeReviewEligibility()
        } catch {}
        loading = false
    }

    // Mirrors Web's profile/bookings/page.tsx eligibility: has a place, the
    // date has passed, and the user hasn't already reviewed that place.
    private func computeReviewEligibility() async {
        guard let userId = deps.session.userId else { return }
        let todayVN = todayVNString()
        var checkedPlaceIds: [String: Bool] = [:]
        var eligible: Set<String> = []

        for b in bookings {
            guard let placeId = b.placeId, !placeId.isEmpty, b.date < todayVN else { continue }
            let alreadyReviewed: Bool
            if let cached = checkedPlaceIds[placeId] {
                alreadyReviewed = cached
            } else {
                alreadyReviewed = (try? await service.hasReviewed(placeId: placeId, userId: userId)) ?? true
                checkedPlaceIds[placeId] = alreadyReviewed
            }
            if !alreadyReviewed { eligible.insert(b.id) }
        }
        reviewEligible = eligible
    }

    private func todayVNString() -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? .current
        let df = DateFormatter()
        df.calendar = calendar
        df.timeZone = calendar.timeZone
        df.dateFormat = "yyyy-MM-dd"
        return df.string(from: Date())
    }
}
