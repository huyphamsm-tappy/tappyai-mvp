import SwiftUI

struct TappyKnowsView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter

    @State private var memory: UserMemory?
    @State private var loading = true
    @State private var cleared = false
    @State private var confirmClear = false
    @State private var clearing = false
    @State private var editing = false

    // Response style (localStorage equivalent)
    @AppStorage("tappy_response_tone") private var tone = ""
    @AppStorage("tappy_response_length") private var length = ""

    private var service: ProfileService { ProfileService(api: deps.api) }

    private var factCount: Int {
        guard let m = memory else { return 0 }
        var n = 0
        if m.locationBase != nil { n += 1 }
        if m.companions != nil { n += 1 }
        if m.timing != nil { n += 1 }
        if m.personality != nil { n += 1 }
        let prefs = m.preferences
        if let f = prefs.food { n += min(f.count, 3) }
        if let s = prefs.spa { n += min(s.count, 3) }
        if let e = prefs.entertainment { n += min(e.count, 3) }
        if let sh = prefs.shopping { n += min(sh.count, 3) }
        if let a = prefs.avoid { n += min(a.count, 3) }
        n += m.budget.count
        n += min(m.history.count, 5)
        return n
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                headerRow
                if !loading { responseStyleCard }

                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if cleared || memory == nil {
                    emptyState
                } else {
                    memoryContent
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("🧠 Tappy biết gì về bạn")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if memory != nil && !cleared {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        editing.toggle()
                    } label: {
                        if editing {
                            HStack(spacing: 4) {
                                Image(systemName: "checkmark")
                                Text("Xong")
                            }
                            .font(.system(size: 12, weight: .medium))
                        } else {
                            HStack(spacing: 4) {
                                Image(systemName: "pencil")
                                Text("Sửa")
                            }
                            .font(.system(size: 12, weight: .medium))
                        }
                    }
                }
            }
        }
        .task { await loadMemory() }
    }

    // MARK: - Header

    private var headerRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Tappy học từ mỗi cuộc trò chuyện để phục vụ bạn tốt hơn")
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Response Style

    private var responseStyleCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: Spacing.xs) {
                Image(systemName: "sparkles")
                    .font(.system(size: 13))
                    .foregroundStyle(TappyColor.primary)
                Text("PHONG CÁCH TRẢ LỜI CỦA TAPPY")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
            }

            Text("Giọng điệu")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)
            HStack(spacing: Spacing.sm) {
                stylePill("Thân mật", key: "tone", value: "friendly")
                stylePill("Trung lập", key: "tone", value: "neutral")
                stylePill("Lịch sự", key: "tone", value: "formal")
            }

            Text("Độ dài")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.top, 4)
            HStack(spacing: Spacing.sm) {
                stylePill("Ngắn gọn", key: "length", value: "short")
                stylePill("Đầy đủ", key: "length", value: "detailed")
            }

            Text("Bỏ chọn tất cả = để Tappy tự điều chỉnh theo cách bạn nhắn.")
                .font(.system(size: 10))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.top, 4)
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
    private func stylePill(_ label: String, key: String, value: String) -> some View {
        let isActive = (key == "tone" ? tone : length) == value
        Button {
            if key == "tone" { tone = tone == value ? "" : value }
            else { length = length == value ? "" : value }
        } label: {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, 6)
                .background(isActive ? TappyColor.primary : TappyColor.surface)
                .foregroundStyle(isActive ? .white : TappyColor.textSecondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "brain")
                .font(.system(size: 40))
                .foregroundStyle(TappyColor.textSecondary.opacity(0.4))
            Text(cleared ? "Đã xóa bộ nhớ" : "Tappy chưa nhớ gì về bạn")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
            Text("Chat với Tappy để Tappy bắt đầu học về bạn")
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)

            Button {
                router.popToRoot(on: .chat)
                router.switchTo(.chat)
            } label: {
                Text("Bắt đầu chat")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, 10)
                    .background(TappyColor.primary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 40)
    }

    // MARK: - Memory Content

    @ViewBuilder
    private var memoryContent: some View {
        if let m = memory {
            // Fact count banner
            HStack(spacing: Spacing.md) {
                Image(systemName: "brain")
                    .font(.system(size: 22))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(Color.white.opacity(0.2))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(factCount) điều Tappy nhớ về bạn")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                    if let updated = m.updatedAt, let date = parseDate(updated) {
                        Text("Cập nhật \(formatDate(date))")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.8))
                    } else {
                        Text("Cập nhật tự động sau mỗi cuộc chat")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.8))
                    }
                }
                Spacer()
            }
            .padding(Spacing.md)
            .background(LinearGradient(colors: [TappyColor.primary, TappyColor.primary.opacity(0.7)], startPoint: .leading, endPoint: .trailing))
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))

            // Location
            if let loc = m.locationBase {
                memoryCard(icon: "mappin", label: "Khu vực", iconColor: .blue) {
                    editableRow(loc) { removeField("location_base") }
                }
            }

            // Companions + Timing
            if m.companions != nil || m.timing != nil {
                HStack(spacing: Spacing.sm) {
                    if let comp = m.companions {
                        memoryCard(icon: "person.2", label: "Hay đi với", iconColor: .purple) {
                            editableRow(comp) { removeField("companions") }
                        }
                    }
                    if let timing = m.timing {
                        memoryCard(icon: "clock", label: "Thời gian hay đi", iconColor: .orange) {
                            editableRow(timing) { removeField("timing") }
                        }
                    }
                }
            }

            // Personality
            if let personality = m.personality {
                memoryCard(icon: "sparkles", label: "Phong cách", iconColor: .pink) {
                    editableRow(personality) { removeField("personality") }
                }
            }

            // Food preferences
            if let food = m.preferences.food, !food.isEmpty {
                memoryCard(icon: "fork.knife", label: "Ẩm thực yêu thích", iconColor: .orange) {
                    tagList(food, color: .orange) { idx in removeTag("food", idx) }
                }
            }

            // Spa + Entertainment
            if (m.preferences.spa?.isEmpty == false) || (m.preferences.entertainment?.isEmpty == false) {
                memoryCard(icon: "heart", label: "Giải trí & Thư giãn", iconColor: .pink) {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        if let spa = m.preferences.spa, !spa.isEmpty {
                            Text("Spa").font(.system(size: 10)).foregroundStyle(TappyColor.textSecondary)
                            tagList(spa, color: .purple) { idx in removeTag("spa", idx) }
                        }
                        if let ent = m.preferences.entertainment, !ent.isEmpty {
                            Text("Giải trí").font(.system(size: 10)).foregroundStyle(TappyColor.textSecondary)
                            tagList(ent, color: .blue) { idx in removeTag("entertainment", idx) }
                        }
                    }
                }
            }

            // Shopping
            if let shopping = m.preferences.shopping, !shopping.isEmpty {
                memoryCard(icon: "bag", label: "Mua sắm", iconColor: .green) {
                    tagList(shopping, color: .green) { idx in removeTag("shopping", idx) }
                }
            }

            // Avoid
            if let avoid = m.preferences.avoid, !avoid.isEmpty {
                memoryCard(icon: "xmark.circle", label: "Không thích / Kiêng", iconColor: .red) {
                    tagList(avoid, color: .red) { idx in removeTag("avoid", idx) }
                }
            }

            // Budget
            if !m.budget.isEmpty {
                memoryCard(icon: "dollarsign.circle", label: "Ngân sách thường dùng", iconColor: .green) {
                    VStack(spacing: 6) {
                        ForEach(Array(m.budget.keys.sorted()), id: \.self) { cat in
                            if let range = m.budget[cat] {
                                HStack {
                                    Text(cat.capitalized)
                                        .font(.system(size: 13))
                                        .foregroundStyle(TappyColor.textSecondary)
                                    Spacer()
                                    Text(formatBudget(range))
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(TappyColor.textPrimary)
                                    if editing {
                                        removeButton { removeBudget(cat) }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // History
            if !m.history.isEmpty {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text("CHỦ ĐỀ HAY HỎI TAPPY")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(TappyColor.textSecondary)
                        .padding(.horizontal, 2)

                    FlowLayout(spacing: 6) {
                        ForEach(Array(m.history.suffix(8).reversed()), id: \.self) { h in
                            HStack(spacing: 4) {
                                Text(h)
                                    .font(.system(size: 11))
                                    .foregroundStyle(TappyColor.textSecondary)
                                if editing {
                                    Button { removeHistory(h) } label: {
                                        Image(systemName: "xmark")
                                            .font(.system(size: 8, weight: .bold))
                                            .foregroundStyle(.red)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, 5)
                            .background(TappyColor.surface)
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

            // Clear memory
            clearMemoryCard
        }
    }

    // MARK: - Clear Memory

    private var clearMemoryCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Xóa bộ nhớ")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text("Tappy sẽ quên tất cả và bắt đầu lại từ đầu với bạn.")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)

            if confirmClear {
                HStack(spacing: Spacing.sm) {
                    Button {
                        Task { await handleClear() }
                    } label: {
                        HStack(spacing: 4) {
                            if clearing { ProgressView().tint(.white) }
                            else { Image(systemName: "trash").font(.system(size: 11)) }
                            Text("Xác nhận xóa")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.red)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    }
                    .buttonStyle(.plain)
                    .disabled(clearing)

                    Button { confirmClear = false } label: {
                        Text("Hủy")
                            .font(.system(size: 12, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(TappyColor.surface)
                            .foregroundStyle(TappyColor.textSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    }
                    .buttonStyle(.plain)
                }
            } else {
                Button { confirmClear = true } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "trash").font(.system(size: 11))
                        Text("Xóa bộ nhớ của Tappy")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(.red)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, 8)
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.lg)
                            .stroke(Color.red.opacity(0.3), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(Color.red.opacity(0.15), lineWidth: 1)
        )
    }

    // MARK: - Helpers

    @ViewBuilder
    private func memoryCard<Content: View>(icon: String, label: String, iconColor: Color, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack(spacing: Spacing.xs) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundStyle(iconColor)
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func editableRow(_ text: String, onRemove: @escaping () -> Void) -> some View {
        HStack {
            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(TappyColor.textPrimary)
            Spacer()
            if editing { removeButton(action: onRemove) }
        }
    }

    @ViewBuilder
    private func tagList(_ items: [String], color: Color, onRemove: @escaping (Int) -> Void) -> some View {
        FlowLayout(spacing: 6) {
            ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
                HStack(spacing: 4) {
                    Text(item)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(color)
                    if editing {
                        Button { onRemove(idx) } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 5)
                .background(color.opacity(0.08))
                .clipShape(Capsule())
            }
        }
    }

    @ViewBuilder
    private func removeButton(action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(TappyColor.textSecondary)
                .frame(width: 22, height: 22)
                .background(TappyColor.surface)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }

    private func formatBudget(_ range: BudgetRange) -> String {
        let fmtVND = { (n: Int) -> String in
            if n >= 1_000_000 { return "\(n / 1_000_000) triệu" }
            return "\(n / 1000)k"
        }
        if range.min > 0 { return "\(fmtVND(range.min))–\(fmtVND(range.max))" }
        return "dưới \(fmtVND(range.max))"
    }

    private func parseDate(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    private func formatDate(_ date: Date) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "vi_VN")
        df.dateFormat = "dd/MM/yyyy"
        return df.string(from: date)
    }

    // MARK: - Actions

    private func loadMemory() async {
        do {
            let resp = try await service.fetchMemory()
            memory = resp.memory
        } catch {}
        loading = false
    }

    private func handleClear() async {
        clearing = true
        try? await service.clearMemory()
        memory = nil
        cleared = true
        confirmClear = false
        clearing = false
    }

    private func removeField(_ field: String) {
        guard var m = memory else { return }
        switch field {
        case "location_base": m.locationBase = nil
        case "companions": m.companions = nil
        case "timing": m.timing = nil
        case "personality": m.personality = nil
        default: break
        }
        memory = m
        Task { try? await service.patchMemory([field: NSNull()]) }
    }

    private func removeTag(_ category: String, _ idx: Int) {
        guard var m = memory else { return }
        switch category {
        case "food": m.preferences.food?.remove(at: idx)
        case "spa": m.preferences.spa?.remove(at: idx)
        case "entertainment": m.preferences.entertainment?.remove(at: idx)
        case "shopping": m.preferences.shopping?.remove(at: idx)
        case "avoid": m.preferences.avoid?.remove(at: idx)
        default: break
        }
        memory = m
        let list: [String]
        switch category {
        case "food": list = m.preferences.food ?? []
        case "spa": list = m.preferences.spa ?? []
        case "entertainment": list = m.preferences.entertainment ?? []
        case "shopping": list = m.preferences.shopping ?? []
        case "avoid": list = m.preferences.avoid ?? []
        default: list = []
        }
        Task { try? await service.patchMemory(["preferences": [category: list]]) }
    }

    private func removeHistory(_ topic: String) {
        guard var m = memory else { return }
        m.history.removeAll { $0 == topic }
        memory = m
        Task { try? await service.patchMemory(["history": m.history]) }
    }

    private func removeBudget(_ cat: String) {
        guard var m = memory else { return }
        m.budget.removeValue(forKey: cat)
        memory = m
        Task { try? await service.patchMemory(["budget": m.budget.mapValues { ["min": $0.min, "max": $0.max] }]) }
    }
}

// MARK: - Flow Layout

private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
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
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            totalHeight = y + rowHeight
        }
        return (CGSize(width: maxWidth, height: totalHeight), positions)
    }
}
