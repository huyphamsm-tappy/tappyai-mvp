import SwiftUI

struct CurrencyView: View {
    @AppStateObject private var vm: CurrencyViewModel
    @Environment(\.dismiss) private var dismiss

    init(deps: AppDependencies) {
        let service = UtilityToolsService(api: deps.api)
        _vm = AppStateObject(wrappedValue: CurrencyViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                amountInput
                currencySelectors
                resultCard
                rateInfo
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("💱 Quy đổi tiền tệ")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.loadRates() }
    }

    // MARK: - Amount input

    private var amountInput: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Số tiền")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            TextField("Nhập số tiền", text: $vm.amount)
                .font(.system(size: 28, weight: .black))
                .keyboardType(.decimalPad)
                .foregroundStyle(TappyColor.textPrimary)

            HStack(spacing: Spacing.xs) {
                ForEach(["100000", "500000", "1000000", "5000000"], id: \.self) { v in
                    Button {
                        vm.amount = v
                    } label: {
                        Text(formatPreset(v))
                            .font(.system(size: 12, weight: .medium))
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, Spacing.xs)
                            .background(vm.amount == v ? TappyColor.primary : TappyColor.surface)
                            .foregroundStyle(vm.amount == v ? .white : TappyColor.textSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    }
                    .buttonStyle(.plain)
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

    // MARK: - Currency selectors

    private var currencySelectors: some View {
        VStack(spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                currencyPicker(label: "Từ", code: $vm.fromCode)
                Button { vm.swap() } label: {
                    Image(systemName: "arrow.left.arrow.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(TappyColor.primary)
                        .frame(width: 40, height: 40)
                        .background(TappyColor.primary.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                }
                .buttonStyle(.plain)
                currencyPicker(label: "Sang", code: $vm.toCode)
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

    private func currencyPicker(label: String, code: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(label)
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
            Picker("", selection: code) {
                ForEach(supportedCurrencies) { cur in
                    Text("\(cur.flag) \(cur.code)")
                        .tag(cur.code)
                }
            }
            .pickerStyle(.menu)
            .tint(TappyColor.textPrimary)
            if let cur = supportedCurrencies.first(where: { $0.code == code.wrappedValue }) {
                Text("\(cur.flag) \(cur.name)")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Result card

    private var resultCard: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            if vm.loading {
                HStack(spacing: Spacing.xs) {
                    ProgressView()
                        .tint(.white.opacity(0.7))
                        .scaleEffect(0.8)
                    Text("Đang tải tỷ giá...")
                        .font(TappyFont.callout)
                        .foregroundStyle(.white.opacity(0.7))
                }
            } else if let converted = vm.convertedAmount, let rate = vm.conversionRate {
                Text("\(formatAmount(vm.numAmount, decimals: vm.fromCurrency.decimals)) \(vm.fromCode) =")
                    .font(TappyFont.callout)
                    .foregroundStyle(.white.opacity(0.7))

                Text(formatAmount(converted, decimals: vm.toCurrency.decimals))
                    .font(.system(size: 34, weight: .black))
                    .foregroundStyle(.white)

                Text("\(vm.toCurrency.flag) \(vm.toCode)")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))

                Divider().background(.white.opacity(0.2)).padding(.vertical, Spacing.xs)

                Text("1 \(vm.fromCode) = \(formatAmount(rate, decimals: vm.toCurrency.decimals > 0 ? 4 : 2)) \(vm.toCode)")
                    .font(TappyFont.caption)
                    .foregroundStyle(.white.opacity(0.6))
                Text("1 \(vm.toCode) = \(formatAmount(1.0 / rate, decimals: vm.fromCurrency.decimals > 0 ? 4 : 2)) \(vm.fromCode)")
                    .font(TappyFont.caption)
                    .foregroundStyle(.white.opacity(0.6))
            } else {
                Text("Nhập số tiền để quy đổi")
                    .font(TappyFont.callout)
                    .foregroundStyle(.white.opacity(0.7))
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

    // MARK: - Rate info

    private var rateInfo: some View {
        VStack(spacing: Spacing.xxs) {
            if vm.isFallback {
                Text("⚠️ Đang dùng tỷ giá dự phòng")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
            } else if let date = vm.formattedDate {
                HStack(spacing: Spacing.xxs) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 10))
                    Text("Cập nhật: \(date)")
                }
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
            }
            Text("Tỷ giá tham khảo, không dùng cho giao dịch thực tế")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
        }
        .padding(.bottom, Spacing.md)
    }

    // MARK: - Helpers

    private func formatAmount(_ value: Double, decimals: Int) -> String {
        if !value.isFinite { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.minimumFractionDigits = decimals
        formatter.maximumFractionDigits = decimals
        return formatter.string(from: NSNumber(value: value)) ?? "—"
    }

    private func formatPreset(_ value: String) -> String {
        guard let num = Int(value) else { return value }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: "vi_VN")
        return formatter.string(from: NSNumber(value: num)) ?? value
    }
}
