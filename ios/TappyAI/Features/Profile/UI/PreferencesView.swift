import SwiftUI
import Supabase

struct PreferencesView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter

    @State private var budgetLevel: String?
    @State private var cuisines: [String] = []
    @State private var dietary = ""
    @State private var preferences: [String] = []
    @State private var newPref = ""
    @State private var gender: String?
    @State private var loading = true
    @State private var saving = false
    @State private var saved = false
    @State private var saveError = false

    private var service: ProfileService { ProfileService(api: deps.api) }

    private let budgetOptions: [(value: String, label: String, desc: String, emoji: String)] = [
        ("cheap", "Tiết kiệm", "Dưới 150k/người", "💚"),
        ("mid", "Trung bình", "150k–500k/người", "💛"),
        ("high", "Cao cấp", "500k+/người", "❤️"),
    ]

    private let cuisineOptions = [
        "Phở & Bún", "Cơm tấm", "Lẩu", "Nướng BBQ", "Hải sản",
        "Chay & Thuần chay", "Sushi & Nhật", "Hàn Quốc", "Pizza & Burger",
        "Dimsum & Trung Hoa", "Cà phê & Bánh", "Món miền Bắc", "Món miền Nam",
        "Đồ ăn nhanh", "Kem & Tráng miệng",
    ]

    private let quickChips = [
        "Ăn chay thứ 6", "Ngân sách ăn trưa 60–80k", "Thích spa kiểu Nhật",
        "Dị ứng hải sản", "Hay đi Quận 3", "Không ăn được cay",
        "Hay đi Bình Thạnh", "Thích không gian yên tĩnh",
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else {
                    infoBanner
                    freeformSection
                    genderSection
                    budgetSection
                    cuisineSection
                    dietarySection
                    saveButton
                    if saveError {
                        Text("Không thể lưu sở thích. Vui lòng thử lại.")
                            .font(.system(size: 13))
                            .foregroundStyle(.red)
                    }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Sở thích của tôi")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadPreferences() }
    }

    // MARK: - Info Banner

    private var infoBanner: some View {
        HStack(spacing: Spacing.sm) {
            Text("✨")
            Text("TappyAI dùng thông tin này để gợi ý phù hợp hơn với bạn.")
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.primary)
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

    // MARK: - Freeform preferences

    private var freeformSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("🧠 Tappy nhớ bạn")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text("Thêm bất cứ thông tin nào để TappyAI gợi ý sát hơn — khu vực, ngân sách, dị ứng, thói quen...")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)

            // Quick chips
            FlowLayout(spacing: 6) {
                ForEach(quickChips.filter { !preferences.contains($0) }, id: \.self) { chip in
                    Button { addPref(chip) } label: {
                        Text("+ \(chip)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(TappyColor.primary)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, 6)
                            .overlay(
                                Capsule().stroke(TappyColor.primary.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4]))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            // Input
            HStack(spacing: Spacing.sm) {
                TextField("Thêm sở thích của bạn...", text: $newPref)
                    .font(.system(size: 13))
                    .onSubmit { addPref(newPref) }
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, 10)
                    .background(TappyColor.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.lg)
                            .stroke(TappyColor.border, lineWidth: 1)
                    )

                Button { addPref(newPref) } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 12))
                        Text("Thêm").font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, 10)
                    .background(newPref.trimmingCharacters(in: .whitespaces).isEmpty ? TappyColor.primary.opacity(0.4) : TappyColor.primary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                }
                .buttonStyle(.plain)
                .disabled(newPref.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            // Added preferences
            if !preferences.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(preferences, id: \.self) { pref in
                        HStack(spacing: 4) {
                            Text(pref)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(TappyColor.primary)
                            Button { removePref(pref) } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundStyle(.red)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 5)
                        .background(TappyColor.primary.opacity(0.08))
                        .clipShape(Capsule())
                    }
                }
            } else {
                Text("Chưa có sở thích nào. Thêm bằng chips bên trên hoặc tự nhập.")
                    .font(.system(size: 11))
                    .foregroundStyle(TappyColor.textSecondary)
                    .italic()
            }
        }
    }

    // MARK: - Gender

    private var genderSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("👤 Bạn là")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text("Giúp Tappy gợi ý câu hỏi phù hợp hơn với bạn")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)

            HStack(spacing: Spacing.sm) {
                ForEach([("female", "Nữ", "👩"), ("male", "Nam", "👨")], id: \.0) { (value, label, emoji) in
                    Button {
                        gender = gender == value ? nil : value
                    } label: {
                        HStack(spacing: 6) {
                            Text(emoji).font(.system(size: 18))
                            Text(label)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(gender == value ? TappyColor.primary : TappyColor.textPrimary)
                            if gender == value {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 11))
                                    .foregroundStyle(TappyColor.primary)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(TappyColor.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                        .overlay(
                            RoundedRectangle(cornerRadius: Radius.xl)
                                .stroke(gender == value ? TappyColor.primary : TappyColor.border, lineWidth: gender == value ? 2 : 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Budget

    private var budgetSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("💰 Ngân sách ăn uống thường ngày")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)

            HStack(spacing: Spacing.sm) {
                ForEach(budgetOptions, id: \.value) { opt in
                    Button {
                        budgetLevel = budgetLevel == opt.value ? nil : opt.value
                    } label: {
                        VStack(spacing: 6) {
                            Text(opt.emoji).font(.system(size: 22))
                            Text(opt.label)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(budgetLevel == opt.value ? TappyColor.primary : TappyColor.textPrimary)
                            Text(opt.desc)
                                .font(.system(size: 10))
                                .foregroundStyle(TappyColor.textSecondary)
                            if budgetLevel == opt.value {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 11))
                                    .foregroundStyle(TappyColor.primary)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(TappyColor.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                        .overlay(
                            RoundedRectangle(cornerRadius: Radius.xl)
                                .stroke(budgetLevel == opt.value ? TappyColor.primary : TappyColor.border, lineWidth: budgetLevel == opt.value ? 2 : 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Cuisine

    private var cuisineSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("🍜 Ẩm thực yêu thích")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)

            FlowLayout(spacing: 8) {
                ForEach(cuisineOptions, id: \.self) { item in
                    Button { toggleCuisine(item) } label: {
                        Text(item)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(cuisines.contains(item) ? .white : TappyColor.textSecondary)
                            .padding(.horizontal, Spacing.md)
                            .padding(.vertical, 8)
                            .background(cuisines.contains(item) ? TappyColor.primary : TappyColor.cardBackground)
                            .clipShape(Capsule())
                            .overlay(
                                Capsule().stroke(cuisines.contains(item) ? TappyColor.primary : TappyColor.border, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Dietary

    private var dietarySection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("🚫 Dị ứng / kiêng cữ")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text("Ví dụ: không ăn thịt heo, dị ứng hải sản, thuần chay...")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)

            TextField("Ghi chú nếu có...", text: $dietary, axis: .vertical)
                .font(.system(size: 13))
                .lineLimit(3...5)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, 12)
                .background(TappyColor.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.xl)
                        .stroke(TappyColor.border, lineWidth: 1)
                )
        }
    }

    // MARK: - Save

    private var saveButton: some View {
        Button(action: handleSave) {
            HStack(spacing: Spacing.sm) {
                if saving {
                    ProgressView().tint(.white)
                    Text("Đang lưu...")
                } else if saved {
                    Image(systemName: "checkmark")
                    Text("Đã lưu!")
                } else {
                    Image(systemName: "square.and.arrow.down")
                    Text("Lưu sở thích")
                }
            }
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(saved ? Color.green : TappyColor.primary)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        }
        .buttonStyle(.plain)
        .disabled(saving || saved)
        .opacity(saving ? 0.6 : 1)
    }

    // MARK: - Actions

    private func loadPreferences() async {
        do {
            let resp = try await service.fetchPreferences()
            preferences = resp.preferences
            if let s = resp.structured {
                budgetLevel = s.budgetLevel
                cuisines = s.cuisineLikes ?? []
                dietary = s.dietaryRestrictions ?? ""
            }
            if let session = try? await deps.supabase.auth.session,
               let meta = session.user.userMetadata,
               let gJson = meta["gender"],
               case .string(let g) = gJson,
               g == "male" || g == "female" {
                gender = g
            }
        } catch {}
        loading = false
    }

    private func handleSave() {
        saving = true
        saveError = false
        Task {
            do {
                try await service.saveStructuredPreferences(
                    budgetLevel: budgetLevel,
                    cuisineLikes: cuisines,
                    dietaryRestrictions: dietary.trimmingCharacters(in: .whitespaces).isEmpty ? nil : dietary
                )
                try await service.savePreferencesList(preferences)
                if let gender {
                    _ = try? await deps.supabase.auth.update(user: UserAttributes(data: ["gender": .string(gender)]))
                }
                saved = true
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                router.pop(on: .profile)
            } catch {
                saveError = true
            }
            saving = false
        }
    }

    private func addPref(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, !preferences.contains(trimmed), preferences.count < 50 else { return }
        preferences.append(trimmed)
        newPref = ""
    }

    private func removePref(_ pref: String) {
        preferences.removeAll { $0 == pref }
    }

    private func toggleCuisine(_ item: String) {
        if cuisines.contains(item) { cuisines.removeAll { $0 == item } }
        else { cuisines.append(item) }
    }
}

private struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal: proposal, subviews: subviews).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (idx, pos) in result.positions.enumerated() {
            subviews[idx].place(at: CGPoint(x: bounds.minX + pos.x, y: bounds.minY + pos.y), proposal: .unspecified)
        }
    }
    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for sv in subviews {
            let s = sv.sizeThatFits(.unspecified)
            if x + s.width > maxWidth && x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            positions.append(CGPoint(x: x, y: y))
            rowH = max(rowH, s.height)
            x += s.width + spacing
        }
        return (CGSize(width: maxWidth, height: y + rowH), positions)
    }
}
