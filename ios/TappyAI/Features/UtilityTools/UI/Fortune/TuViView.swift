import SwiftUI

enum TuViViewMode: Hashable {
    case day, week, month, year, lifetime
}

struct TuViView: View {
    @State private var birthDate = Date()
    @State private var hasSubmitted = false
    @State private var viewMode: TuViViewMode = .day
    @State private var selectedYear: Int = {
        let cal = Calendar(identifier: .iso8601)
        let vn = Date(timeIntervalSinceNow: 7 * 3600)
        return cal.dateComponents(in: TimeZone(identifier: "Asia/Ho_Chi_Minh")!, from: vn).year ?? 2026
    }()

    private var vnYear: Int {
        let cal = Calendar(identifier: .iso8601)
        let vn = Date(timeIntervalSinceNow: 7 * 3600)
        return cal.dateComponents(in: TimeZone(identifier: "Asia/Ho_Chi_Minh")!, from: vn).year ?? 2026
    }

    private var yearOptions: [Int] {
        Array((vnYear - 5)...(vnYear + 5))
    }

    private var birthComponents: DateComponents {
        Calendar.current.dateComponents([.year, .month, .day], from: birthDate)
    }

    private var birthYear: Int { birthComponents.year ?? 1990 }
    private var birthMonth: Int { birthComponents.month ?? 1 }
    private var birthDay: Int { birthComponents.day ?? 1 }

    private var canChi: CanChi { CanChiData.getByYear(birthYear) }
    private var nguHanh: String { CanChiData.getNguHanh(birthYear) }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                if !hasSubmitted {
                    inputForm
                } else {
                    resultContent
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("🧧 Tử vi")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Input form

    private var inputForm: some View {
        VStack(spacing: Spacing.lg) {
            Text("🧧")
                .font(.system(size: 48))

            VStack(spacing: Spacing.xs) {
                Text("Tử vi theo tuổi")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)
                Text("Nhập ngày sinh dương lịch để xem luận giải")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
            }

            DatePicker("", selection: $birthDate, in: ...Date(), displayedComponents: .date)
                .datePickerStyle(.compact)
                .labelsHidden()
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.sm)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.lg)
                        .stroke(TappyColor.border, lineWidth: 1)
                )

            Button {
                hasSubmitted = true
                viewMode = .day
            } label: {
                Text("Xem tử vi")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(TappyColor.primary)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            }
            .buttonStyle(.plain)
        }
        .padding(Spacing.xl)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Result content

    private var resultContent: some View {
        VStack(spacing: Spacing.md) {
            profileHeader
            modeSelector
            readingContent
            resetButton
        }
    }

    // MARK: - Profile header

    private var profileHeader: some View {
        VStack(spacing: Spacing.sm) {
            Text(canChi.emoji)
                .font(.system(size: 48))
            Text("Tuổi \(canChi.nameVi) — \(canChi.animalVi)")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(TappyColor.textPrimary)
            HStack(spacing: Spacing.xs) {
                Text("Năm sinh: \(String(birthYear))")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                Text(nguHanh)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(TappyColor.primary)
            }
            Text(canChi.traits)
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Mode selector

    private var modeSelector: some View {
        VStack(spacing: Spacing.sm) {
            HStack(spacing: Spacing.xs) {
                periodButton(.day, "Hôm nay")
                periodButton(.week, "Tuần này")
                periodButton(.month, "Tháng này")
            }

            HStack(spacing: Spacing.xs) {
                Text("")
                    .frame(maxWidth: .infinity, maxHeight: 1)
                    .background(TappyColor.border)
                Text("hoặc xem")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                Text("")
                    .frame(maxWidth: .infinity, maxHeight: 1)
                    .background(TappyColor.border)
            }

            HStack(spacing: Spacing.sm) {
                extendedButton(.lifetime, "📖", "Trọn đời")
                extendedButton(.year, "📅", "Theo năm")
            }
        }
    }

    private func periodButton(_ mode: TuViViewMode, _ label: String) -> some View {
        Button {
            viewMode = mode
        } label: {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(viewMode == mode ? TappyColor.primary.opacity(0.1) : TappyColor.surface)
                .foregroundStyle(viewMode == mode ? TappyColor.primary : TappyColor.textSecondary)
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.lg)
                        .stroke(viewMode == mode ? TappyColor.primary : TappyColor.border, lineWidth: viewMode == mode ? 2 : 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
    }

    private func extendedButton(_ mode: TuViViewMode, _ icon: String, _ label: String) -> some View {
        Button {
            viewMode = mode
        } label: {
            HStack(spacing: Spacing.xs) {
                Text(icon)
                    .font(.system(size: 13))
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(viewMode == mode ? TappyColor.primary.opacity(0.1) : TappyColor.surface)
            .foregroundStyle(viewMode == mode ? TappyColor.primary : TappyColor.textSecondary)
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg)
                    .stroke(viewMode == mode ? TappyColor.primary : TappyColor.border, lineWidth: viewMode == mode ? 2 : 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Reading content

    @ViewBuilder
    private var readingContent: some View {
        switch viewMode {
        case .day:
            periodReadingCard(FortuneEngine.generateFortune(subjectId: canChi.id, period: .day, banks: canChi.banks))
        case .week:
            periodReadingCard(FortuneEngine.generateFortune(subjectId: canChi.id, period: .week, banks: canChi.banks))
        case .month:
            periodReadingCard(FortuneEngine.generateFortune(subjectId: canChi.id, period: .month, banks: canChi.banks))
        case .year:
            yearReadingSection
        case .lifetime:
            lifetimeSection
        }
    }

    // MARK: - Period reading card

    private func periodReadingCard(_ reading: FortuneReading) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack {
                Text(reading.periodLabel)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)
                Spacer()
                starRow(reading.score)
            }

            fortuneRow(emoji: "💕", label: "Tình cảm", text: reading.love)
            fortuneRow(emoji: "💼", label: "Sự nghiệp", text: reading.career)
            fortuneRow(emoji: "💰", label: "Tài lộc", text: reading.money)
            fortuneRow(emoji: "🏥", label: "Sức khoẻ", text: reading.health)

            Divider()

            HStack(spacing: Spacing.lg) {
                VStack(spacing: 2) {
                    Text("Số may")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    Text("\(reading.luckyNumber)")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(TappyColor.primary)
                }
                VStack(spacing: 2) {
                    Text("Màu may")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    Text(reading.luckyColor)
                        .font(.system(size: 14, weight: .semibold))
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

    // MARK: - Year reading

    private var yearReadingSection: some View {
        let reading = FortuneEngine.generateYearFortune(subjectId: canChi.id, birthYear: birthYear, targetYear: selectedYear)
        let months = FortuneEngine.generateMonthlyBreakdown(subjectId: canChi.id, birthYear: birthYear, birthMonth: birthMonth, birthDay: birthDay, targetYear: selectedYear)

        return VStack(spacing: Spacing.md) {
            HStack {
                HStack(spacing: Spacing.xs) {
                    Text("📅")
                        .font(.system(size: 14))
                    Text("Chọn năm")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(TappyColor.textPrimary)
                }
                Spacer()
                Picker("", selection: $selectedYear) {
                    ForEach(yearOptions, id: \.self) { y in
                        let idx = ((y - 4) % 12 + 12) % 12
                        Text("\(String(y)) (\(YEAR_ANIMALS[idx]))").tag(y)
                    }
                }
                .pickerStyle(.menu)
                .tint(TappyColor.primary)
            }

            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(reading.compatLabel != "—" ? reading.compatLabel : "Tuổi \(canChi.animalVi) năm \(reading.yearAnimal)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(TappyColor.primary)
                Text(reading.compatNote)
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(TappyColor.primary.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg)
                    .stroke(TappyColor.primary.opacity(0.2), lineWidth: 1)
            )

            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack {
                    Text(reading.periodLabel)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Spacer()
                    starRow(reading.score)
                }

                fortuneRow(emoji: "💕", label: "Tình cảm", text: reading.love)
                fortuneRow(emoji: "💼", label: "Sự nghiệp", text: reading.career)
                fortuneRow(emoji: "💰", label: "Tài lộc", text: reading.money)
                fortuneRow(emoji: "🏥", label: "Sức khoẻ", text: reading.health)

                Divider()

                HStack(spacing: Spacing.lg) {
                    VStack(spacing: 2) {
                        Text("Số may")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                        Text("\(reading.luckyNumber)")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(TappyColor.primary)
                    }
                    VStack(spacing: 2) {
                        Text("Màu may")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                        Text(reading.luckyColor)
                            .font(.system(size: 14, weight: .semibold))
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

            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("Luận giải từng tháng")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, Spacing.lg)

                ForEach(months) { m in
                    MonthCardView(monthData: m)
                }
            }
            .padding(.bottom, Spacing.lg)
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Lifetime

    private var lifetimeSection: some View {
        let lifetime = LIFETIME_READINGS[canChi.id]
        let stages = FortuneEngine.generateLifeStages(subjectId: canChi.id, birthMonth: birthMonth, birthDay: birthDay)

        return VStack(spacing: Spacing.md) {
            if let lt = lifetime {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    HStack(spacing: Spacing.xs) {
                        Text("📖")
                            .font(.system(size: 14))
                        Text("Luận giải trọn đời — \(canChi.animalVi)")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(TappyColor.textPrimary)
                    }

                    Text(lt.overview)
                        .font(TappyFont.callout)
                        .italic()
                        .foregroundStyle(TappyColor.textSecondary)
                        .padding(.leading, Spacing.md)
                        .overlay(alignment: .leading) {
                            Rectangle()
                                .fill(TappyColor.primary.opacity(0.4))
                                .frame(width: 2)
                        }

                    fortuneRow(emoji: "💼", label: "Sự nghiệp cả đời", text: lt.career)
                    fortuneRow(emoji: "💕", label: "Tình cảm", text: lt.love)
                    fortuneRow(emoji: "🏥", label: "Sức khoẻ", text: lt.health)

                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("LỜI KHUYÊN")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(TappyColor.primary)
                        Text(lt.advice)
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textPrimary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(Spacing.md)
                    .background(TappyColor.primary.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                }
                .padding(Spacing.lg)
                .background(TappyColor.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.xl)
                        .stroke(TappyColor.border, lineWidth: 1)
                )
            }

            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("Các giai đoạn cuộc đời")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, Spacing.lg)

                ForEach(stages) { stage in
                    LifeStageCardView(stage: stage)
                }
            }
            .padding(.bottom, Spacing.lg)
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Reset

    private var resetButton: some View {
        Button {
            hasSubmitted = false
        } label: {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 14))
                Text("Xem với ngày sinh khác")
            }
            .font(.system(size: 14, weight: .medium))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(TappyColor.surface)
            .foregroundStyle(TappyColor.textSecondary)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private func fortuneRow(emoji: String, label: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            HStack(spacing: Spacing.xs) {
                Text(emoji)
                    .font(.system(size: 14))
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textPrimary)
            }
            Text(text)
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
        }
    }

    private func starRow(_ score: Int) -> some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { i in
                Image(systemName: i <= score ? "star.fill" : "star")
                    .font(.system(size: 12))
                    .foregroundStyle(i <= score ? .orange : TappyColor.textSecondary.opacity(0.3))
            }
        }
    }
}

// MARK: - Month card

private struct MonthCardView: View {
    let monthData: MonthlyFortune
    @State private var expanded = false

    var body: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() }
            } label: {
                HStack(spacing: Spacing.sm) {
                    Text("T\(monthData.month)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(TappyColor.primary)
                        .frame(width: 32, height: 32)
                        .background(TappyColor.primary.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md))

                    Text(monthData.monthName)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(TappyColor.textPrimary)

                    Spacer()

                    HStack(spacing: 1) {
                        ForEach(1...5, id: \.self) { i in
                            Image(systemName: i <= monthData.score ? "star.fill" : "star")
                                .font(.system(size: 9))
                                .foregroundStyle(i <= monthData.score ? .orange : TappyColor.textSecondary.opacity(0.3))
                        }
                    }

                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.sm)
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    monthRow("💕", "Tình cảm", monthData.love)
                    monthRow("💼", "Sự nghiệp", monthData.career)
                    monthRow("💰", "Tài lộc", monthData.money)
                    monthRow("🏥", "Sức khoẻ", monthData.health)
                    monthRow("📝", "Ghi chú", monthData.note)
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.md)
            }
        }
        .overlay(alignment: .bottom) {
            Divider()
        }
    }

    private func monthRow(_ emoji: String, _ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text(emoji)
                    .font(.system(size: 11))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            Text(text)
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)
        }
    }
}

// MARK: - Life stage card

private struct LifeStageCardView: View {
    let stage: LifeStage
    @State private var expanded = false

    var body: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() }
            } label: {
                HStack(spacing: Spacing.sm) {
                    Text(stage.emoji)
                        .font(.system(size: 20))

                    VStack(alignment: .leading, spacing: 1) {
                        Text(stage.label)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(TappyColor.textPrimary)
                        Text(stage.ageRange)
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }

                    Spacer()

                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.sm)
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text(stage.fate)
                        .font(TappyFont.callout)
                        .italic()
                        .foregroundStyle(TappyColor.textSecondary)
                        .padding(.leading, Spacing.md)
                        .overlay(alignment: .leading) {
                            Rectangle()
                                .fill(TappyColor.primary.opacity(0.3))
                                .frame(width: 2)
                        }

                    stageRow("💼", "Sự nghiệp", stage.career)
                    stageRow("💕", "Tình cảm", stage.love)
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.md)
            }
        }
        .overlay(alignment: .bottom) {
            Divider()
        }
    }

    private func stageRow(_ emoji: String, _ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text(emoji)
                    .font(.system(size: 12))
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            Text(text)
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)
        }
    }
}
