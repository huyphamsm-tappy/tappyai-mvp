import SwiftUI

private let tipPresets = [0, 5, 10, 15, 20]

struct SplitBillView: View {
    @State private var total = ""
    @State private var people = 2
    @State private var tip = 0
    @State private var customTip = ""
    @State private var mode: SplitMode = .equal
    @State private var persons: [SplitPerson] = [
        SplitPerson(id: 1, name: "Người 1", amount: ""),
        SplitPerson(id: 2, name: "Người 2", amount: ""),
    ]

    private var activeTip: Double {
        if !customTip.isEmpty { return Double(customTip) ?? 0 }
        return Double(tip)
    }

    private var totalNum: Double {
        Double(total.replacingOccurrences(of: "[^0-9.]", with: "", options: .regularExpression)) ?? 0
    }

    private var grandTotal: Double { totalNum * (1 + activeTip / 100) }
    private var perPerson: Double { people > 0 ? grandTotal / Double(people) : 0 }

    private var customTotal: Double {
        persons.reduce(0) { $0 + (Double($1.amount) ?? 0) }
    }
    private var customGrand: Double { customTotal * (1 + activeTip / 100) }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                totalAndPeople
                tipSection
                modeToggle
                if mode == .equal {
                    equalResult
                } else {
                    customSplit
                }
                disclaimer
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("🧮 Chia bill")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Total and People

    private var totalAndPeople: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text("Tổng hoá đơn")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                TextField("Nhập số tiền (VND)", text: $total)
                    .font(.system(size: 24, weight: .black))
                    .keyboardType(.numberPad)
                    .foregroundStyle(TappyColor.textPrimary)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, 12)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.lg)
                            .stroke(TappyColor.border, lineWidth: 1)
                    )
            }

            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("Số người")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                HStack(spacing: Spacing.md) {
                    Button { syncPeopleCount(max(2, people - 1)) } label: {
                        Image(systemName: "minus")
                            .font(.system(size: 14, weight: .semibold))
                            .frame(width: 40, height: 40)
                            .background(TappyColor.surface)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    }
                    .buttonStyle(.plain)

                    Text("\(people)")
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(TappyColor.textPrimary)
                        .frame(width: 40, alignment: .center)

                    Button { syncPeopleCount(min(20, people + 1)) } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .semibold))
                            .frame(width: 40, height: 40)
                            .background(TappyColor.surface)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    }
                    .buttonStyle(.plain)

                    Text("người")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Tip section

    private var tipSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Tip")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.xs), count: 4), spacing: Spacing.xs) {
                ForEach(tipPresets, id: \.self) { preset in
                    Button {
                        tip = preset
                        customTip = ""
                    } label: {
                        Text(preset == 0 ? "Không" : "\(preset)%")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.xs)
                            .background(tip == preset && customTip.isEmpty ? TappyColor.primary : TappyColor.surface)
                            .foregroundStyle(tip == preset && customTip.isEmpty ? .white : TappyColor.textSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 2) {
                    TextField("Khác", text: $customTip)
                        .font(.system(size: 13, weight: .semibold))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.center)
                        .onChange(of: customTip) { _ in tip = -1 }
                    if !customTip.isEmpty {
                        Text("%")
                            .font(.system(size: 11))
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
                .padding(.vertical, Spacing.xs)
                .padding(.horizontal, Spacing.xs)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Mode toggle

    private var modeToggle: some View {
        HStack(spacing: Spacing.xxs) {
            modeButton("Chia đều", isActive: mode == .equal) { mode = .equal }
            modeButton("Tuỳ chỉnh", isActive: mode == .custom) { mode = .custom }
        }
        .padding(4)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    }

    private func modeButton(_ title: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.sm)
                .background(isActive ? TappyColor.cardBackground : Color.clear)
                .foregroundStyle(isActive ? TappyColor.textPrimary : TappyColor.textSecondary)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                .shadow(color: isActive ? .black.opacity(0.05) : .clear, radius: 2, y: 1)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Equal result

    private var equalResult: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            if totalNum > 0 {
                Text("Mỗi người trả")
                    .font(TappyFont.callout)
                    .foregroundStyle(.white.opacity(0.7))
                Text("\(fmtVND(perPerson)) đ")
                    .font(.system(size: 34, weight: .black))
                    .foregroundStyle(.white)

                if activeTip > 0 {
                    Text("Đã gồm tip \(Int(activeTip))% — Tổng: \(fmtVND(grandTotal)) đ")
                        .font(TappyFont.caption)
                        .foregroundStyle(.white.opacity(0.6))
                }

                Divider().background(.white.opacity(0.2)).padding(.vertical, Spacing.xs)

                HStack(spacing: 0) {
                    statCol("Hoá đơn", fmtVND(totalNum))
                    statCol("Tip", fmtVND(totalNum * activeTip / 100))
                    statCol("Tổng", fmtVND(grandTotal))
                }
            } else {
                Text("Nhập tổng hoá đơn để tính")
                    .font(TappyFont.callout)
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.xl)
        .background(
            LinearGradient(
                colors: [TappyColor.primary, TappyColor.accent],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
    }

    private func statCol(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.5))
            Text("\(value) đ")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Custom split

    private var customSplit: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Nhập số tiền mỗi người đã dùng")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            ForEach(Array(persons.enumerated()), id: \.element.id) { idx, person in
                HStack(spacing: Spacing.xs) {
                    TextField("Tên", text: binding(for: person.id, field: .name))
                        .font(.system(size: 13, weight: .medium))
                        .frame(width: 80)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, Spacing.sm)
                        .background(TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md))

                    TextField("Số tiền", text: binding(for: person.id, field: .amount))
                        .font(.system(size: 13))
                        .keyboardType(.numberPad)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, Spacing.sm)
                        .background(TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md))

                    Text("đ")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)

                    if persons.count > 2 {
                        Button { removePerson(person.id) } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 12))
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                        .buttonStyle(.plain)
                    }

                    if idx == persons.count - 1 && persons.count < 20 {
                        Button { addPerson() } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 12))
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if customTotal > 0 {
                Divider().padding(.vertical, Spacing.xs)

                ForEach(persons) { p in
                    let pAmt = Double(p.amount) ?? 0
                    let pShare = pAmt * (1 + activeTip / 100)
                    HStack {
                        Text(p.name)
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textSecondary)
                        Spacer()
                        Text("\(fmtVND(pShare)) đ")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(TappyColor.textPrimary)
                    }
                }

                Divider().padding(.vertical, Spacing.xxs)

                HStack {
                    Text("Tổng (sau tip)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(TappyColor.primary)
                    Spacer()
                    Text("\(fmtVND(customGrand)) đ")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(TappyColor.primary)
                }
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Disclaimer

    private var disclaimer: some View {
        Text("Công cụ hỗ trợ tính toán, chỉ mang tính tham khảo")
            .font(TappyFont.caption)
            .foregroundStyle(TappyColor.textSecondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.bottom, Spacing.md)
    }

    // MARK: - Helpers

    private func syncPeopleCount(_ n: Int) {
        people = n
        if mode == .equal { return }
        if n > persons.count {
            for i in persons.count..<n {
                persons.append(SplitPerson(id: i + 1, name: "Người \(i + 1)", amount: ""))
            }
        } else if n < persons.count {
            persons = Array(persons.prefix(n))
        }
    }

    private func addPerson() {
        let next = (persons.map(\.id).max() ?? 0) + 1
        persons.append(SplitPerson(id: next, name: "Người \(persons.count + 1)", amount: ""))
    }

    private func removePerson(_ id: Int) {
        guard persons.count > 2 else { return }
        persons.removeAll { $0.id == id }
    }

    private enum PersonField { case name, amount }

    private func binding(for id: Int, field: PersonField) -> Binding<String> {
        Binding(
            get: {
                guard let p = persons.first(where: { $0.id == id }) else { return "" }
                return field == .name ? p.name : p.amount
            },
            set: { newValue in
                guard let idx = persons.firstIndex(where: { $0.id == id }) else { return }
                switch field {
                case .name: persons[idx].name = newValue
                case .amount: persons[idx].amount = newValue
                }
            }
        )
    }

    private func fmtVND(_ n: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: n)) ?? "0"
    }
}

// MARK: - Models

private enum SplitMode {
    case equal, custom
}

private struct SplitPerson: Identifiable {
    let id: Int
    var name: String
    var amount: String
}
