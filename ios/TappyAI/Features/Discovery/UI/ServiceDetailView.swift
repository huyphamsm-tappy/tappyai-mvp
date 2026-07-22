import SwiftUI

struct ServiceDetailView: View {
    let service: ServiceDetail
    let deps: AppDependencies

    @State private var bookings: [Booking] = []
    @State private var reviews: [TappyReview] = []
    @State private var showBooking = false

    private var meta: CategoryMeta { CategoryMeta.get(service.type) }
    private var placesService: PlacesService { PlacesService(api: deps.api) }

    private var mapsURL: URL? {
        if !service.mapsLink.isEmpty { return URL(string: service.mapsLink) }
        let q = service.address.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://maps.google.com/?q=\(q)")
    }

    private var tappyAvg: Double? {
        guard !reviews.isEmpty else { return nil }
        let sum = reviews.reduce(0) { $0 + $1.rating }
        return Double(sum) / Double(reviews.count)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                heroBanner
                content
            }
        }
        .background(TappyColor.background)
        .navigationTitle(service.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
    }

    // MARK: - Hero

    private var heroBanner: some View {
        ZStack {
            LinearGradient(
                colors: [TappyColor.primary.opacity(0.8), TappyColor.primary],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            Text(meta.emoji)
                .font(.system(size: 64))
        }
        .frame(height: 200)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Content

    private var content: some View {
        VStack(spacing: Spacing.lg) {
            headerSection
            infoCard
            if !service.note.isEmpty { noteCard }
            if !bookings.isEmpty { myBookingsCard }
            if !reviews.isEmpty { communityReviewsCard }
            platformLinksSection
            bookingSection
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.lg)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(alignment: .top) {
                Text(service.name)
                    .font(.system(size: 20, weight: .black))
                    .foregroundStyle(TappyColor.textPrimary)
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    if !service.rating.isEmpty {
                        ratingBadge(service.rating, color: .orange)
                    }
                    if let avg = tappyAvg {
                        HStack(spacing: 2) {
                            ratingBadge(String(format: "%.1f", avg), color: .purple)
                            Text("Tappy")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.purple)
                        }
                    }
                }
            }
            HStack(spacing: Spacing.xs) {
                Text(meta.emoji)
                    .font(.system(size: 11))
                Text(meta.label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(TappyColor.primary)
            }
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 4)
            .background(TappyColor.primary.opacity(0.08))
            .clipShape(Capsule())
        }
    }

    private func ratingBadge(_ text: String, color: Color) -> some View {
        HStack(spacing: 2) {
            Image(systemName: "star.fill")
                .font(.system(size: 10))
                .foregroundStyle(color)
            Text(text)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(color)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, 4)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    }

    // MARK: - Info card

    private var infoCard: some View {
        VStack(spacing: 0) {
            if !service.address.isEmpty {
                infoRow(icon: "mappin", iconColor: .blue, label: "Địa chỉ", value: service.address, link: mapsURL)
                Divider().padding(.leading, 52)
            }
            if !service.phone.isEmpty {
                infoRow(icon: "phone.fill", iconColor: .green, label: "Điện thoại", value: service.phone, link: URL(string: "tel:\(service.phone)"))
                Divider().padding(.leading, 52)
            }
            if !service.hours.isEmpty {
                infoRow(icon: "clock.fill", iconColor: .orange, label: "Giờ mở cửa", value: service.hours)
                Divider().padding(.leading, 52)
            }
            if !service.price.isEmpty {
                HStack(spacing: Spacing.md) {
                    Text("💰")
                        .font(.system(size: 16))
                        .frame(width: 36, height: 36)
                        .background(Color.purple.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Mức giá")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                        Text(service.price)
                            .font(.system(size: 13))
                            .foregroundStyle(TappyColor.textPrimary)
                    }
                    Spacer()
                }
                .padding(Spacing.md)
            }
        }
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    private func infoRow(icon: String, iconColor: Color, label: String, value: String, link: URL? = nil) -> some View {
        let content = HStack(spacing: Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(iconColor)
                .frame(width: 36, height: 36)
                .background(iconColor.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                Text(value)
                    .font(.system(size: 13))
                    .foregroundStyle(TappyColor.textPrimary)
                    .lineLimit(2)
            }
            Spacer()
            if link != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundStyle(TappyColor.textSecondary.opacity(0.5))
            }
        }
        .padding(Spacing.md)

        return Group {
            if let link {
                Link(destination: link) { content }
            } else {
                content
            }
        }
    }

    // MARK: - Note

    private var noteCard: some View {
        HStack(spacing: Spacing.sm) {
            Text("💡")
            Text(service.note)
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(TappyColor.primary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.primary.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - My bookings

    private var myBookingsCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Lịch đặt của bạn")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            ForEach(bookings) { b in
                HStack {
                    Text("\(b.date)\(b.time.map { " lúc \($0)" } ?? "")\(b.guests > 1 ? " • \(b.guests) người" : "")")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    Spacer()
                    Text(b.statusLabel)
                        .font(.system(size: 10, weight: .medium))
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 2)
                        .background(statusColor(b.status).opacity(0.1))
                        .foregroundStyle(statusColor(b.status))
                        .clipShape(Capsule())
                }
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

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "confirmed": return .green
        case "cancelled": return .red
        default: return .orange
        }
    }

    // MARK: - Community reviews

    private var communityReviewsCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Text("Đánh giá từ TappyAI")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textPrimary)
                Spacer()
                if let avg = tappyAvg {
                    HStack(spacing: 2) {
                        Text(starString(Int(avg.rounded())))
                            .font(.system(size: 10))
                            .foregroundStyle(.orange)
                        Text(String(format: "%.1f", avg))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.orange)
                        Text("(\(reviews.count))")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
            }

            ForEach(reviews) { r in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: Spacing.xs) {
                        Text(starString(r.rating))
                            .font(.system(size: 10))
                            .foregroundStyle(.orange)
                        Text(formatDate(r.createdAt))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    Text(r.body)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textPrimary)
                        .lineLimit(3)
                }
                if r.id != reviews.last?.id {
                    Divider()
                }
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

    // MARK: - Platform links

    private var platformLinksSection: some View {
        let links = PlatformLinks.forService(service)
        return Group {
            if !links.isEmpty {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text("Đặt qua nền tảng")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(TappyColor.textPrimary)
                    ForEach(links) { link in
                        if let linkURL = URL(string: link.url) {
                        Link(destination: linkURL) {
                            HStack {
                                Text(link.name)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(TappyColor.primary)
                                Spacer()
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 11))
                                    .foregroundStyle(TappyColor.primary)
                            }
                            .padding(Spacing.md)
                            .background(TappyColor.primary.opacity(0.05))
                            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                            .overlay(
                                RoundedRectangle(cornerRadius: Radius.lg)
                                    .stroke(TappyColor.primary.opacity(0.2), lineWidth: 1)
                            )
                        }
                        } // if let linkURL
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
        }
    }

    // MARK: - Booking

    private var bookingSection: some View {
        BookingFormView(service: service, deps: deps)
    }

    // MARK: - Helpers

    private func starString(_ count: Int) -> String {
        String(repeating: "★", count: min(count, 5)) + String(repeating: "☆", count: max(0, 5 - count))
    }

    private func formatDate(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
        let df = DateFormatter()
        df.locale = Locale(identifier: "vi_VN")
        df.dateFormat = "dd/MM/yyyy"
        return df.string(from: date)
    }

    private func loadData() async {
        async let bookingsTask: () = loadBookings()
        async let reviewsTask: () = loadReviews()
        _ = await (bookingsTask, reviewsTask)
    }

    private func loadBookings() async {
        guard let result = try? await placesService.fetchBookings(serviceId: service.id) else { return }
        bookings = Array(result.prefix(3))
    }

    private func loadReviews() async {
        guard !service.placeId.isEmpty else { return }
        guard let result = try? await placesService.fetchPlaceReviews(placeId: service.placeId) else { return }
        reviews = result
    }
}
