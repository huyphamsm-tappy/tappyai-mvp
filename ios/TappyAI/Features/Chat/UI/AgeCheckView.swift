import SwiftUI

extension ChatError {
    /// The three 18+ gate states: the full-screen "Xác nhận bạn đủ 18 tuổi" replaces the inline prompt.
    var isAgeGate: Bool {
        switch self {
        case .ageDeclarationRequired, .ageVerificationRequired, .ageIneligible: return true
        default: return false
        }
    }
}

/// The 18+ gate as its own screen — mockup Sep 10 11_46, web `/age-check` (`AgeCheckView.tsx`),
/// Android `AgeCheckScreen`. ONE screen for both audiences: a guest's answer is a self-declaration
/// (`x-tappy-age-declared: YYYY-MM-DD`), an account's is `PATCH /api/profile {dateOfBirth}`; either
/// way the SERVER decides eligibility and this view only sends what the user stated and shows the
/// answer (`blocked`). Callbacks are the chat view model's existing age entry points.
struct AgeCheckView: View {
    let isGuest: Bool
    /// Under 18: the refusal replaces the form.
    let blocked: Bool
    let submitting: Bool
    let formError: String?
    let onSubmit: (_ day: String, _ month: String, _ year: String) -> Void
    let onEdit: () -> Void
    let onClose: () -> Void

    @State private var day = ""
    @State private var month = ""
    @State private var year = ""

    private static let bg = Color(hex: 0x070B18)
    private static let line = Color.white.opacity(0.10)
    private static let muted = Color.white.opacity(0.55)
    private static let accentGradient = LinearGradient(
        colors: [Color(hex: 0x60A5FA), Color(hex: 0xA78BFA)], startPoint: .leading, endPoint: .trailing)
    private static let ctaGradient = LinearGradient(
        colors: [Color(hex: 0x3B82F6), Color(hex: 0x8B5CF6)], startPoint: .leading, endPoint: .trailing)

    private var canSubmit: Bool { !submitting && !day.isEmpty && !month.isEmpty && !year.isEmpty }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Self.bg.ignoresSafeArea()
            RadialGradient(colors: [Color(hex: 0x1D4ED8).opacity(0.25), .clear],
                           center: .top, startRadius: 0, endRadius: 420)
                .ignoresSafeArea()
            ScrollView {
                VStack(spacing: 0) {
                    header
                    card.padding(.top, 22)
                    intro.padding(.top, 26)
                    Image("TappyWave").resizable().scaledToFit().frame(width: 160, height: 160).padding(.top, 18)
                        .accessibilityHidden(true)
                    trust.padding(.top, 12)
                    Text("agecheck.footer").font(.system(size: 12)).foregroundStyle(.white.opacity(0.35)).padding(.top, 14)
                }
                .padding(.horizontal, 20).padding(.vertical, 16)
            }
            Button(action: onClose) {
                Image(systemName: "xmark").font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7)).frame(width: 44, height: 44)
            }
            .accessibilityLabel(Text("common.close"))
            .accessibilityIdentifier("age-close")
        }
        .preferredColorScheme(.dark)
        .accessibilityIdentifier("age-check")
    }

    // MARK: - Header (lockup)

    private var header: some View {
        HStack(spacing: 10) {
            Image("TappyAILogo").resizable().scaledToFit().frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                (Text("Tappy").foregroundColor(.white) + Text("AI").foregroundColor(Color(hex: 0x60A5FA)))
                    .font(.system(size: 19, weight: .black))
                Text("agecheck.tagline").font(.system(size: 11)).foregroundStyle(.white.opacity(0.45))
            }
            Spacer()
        }
        .padding(.trailing, 44)
    }

    // MARK: - Card

    private var card: some View {
        VStack(spacing: 0) {
            Image(systemName: "shield.fill").font(.system(size: 22)).foregroundStyle(Color(hex: 0x93C5FD))
                .frame(width: 48, height: 48)
                .background(LinearGradient(colors: [Color(hex: 0x3B82F6).opacity(0.25), Color(hex: 0x7C3AED).opacity(0.2)],
                                           startPoint: .topLeading, endPoint: .bottomTrailing))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color(hex: 0x60A5FA).opacity(0.25), lineWidth: 1))
                .padding(.bottom, 14)
            if blocked {
                Text("agecheck.blocked.title").font(.system(size: 24, weight: .black)).foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                Text("agecheck.blocked.desc").font(.system(size: 14)).foregroundStyle(Self.muted)
                    .multilineTextAlignment(.center).padding(.top, 10)
                    .accessibilityIdentifier("age-blocked")
            } else {
                (Text("agecheck.title.lead") + Text(" ") + Text("agecheck.title.accent").foregroundColor(Color(hex: 0xA78BFA)))
                    .font(.system(size: 26, weight: .black)).foregroundStyle(.white).multilineTextAlignment(.center)
                Text("agecheck.desc").font(.system(size: 14)).foregroundStyle(Self.muted)
                    .multilineTextAlignment(.center).padding(.top, 10)
                HStack(spacing: 10) {
                    dateField("agecheck.day", value: $day, placeholder: "DD", options: (1...31).map { String(format: "%02d", $0) }, id: "age-day")
                    dateField("agecheck.month", value: $month, placeholder: "MM", options: (1...12).map { String(format: "%02d", $0) }, id: "age-month")
                    dateField("agecheck.year", value: $year, placeholder: "YYYY", options: yearOptions, id: "age-year")
                        .layoutPriority(1)
                }
                .padding(.top, 20)
                if let formError {
                    Text(formError).font(.system(size: 13)).foregroundStyle(Color(hex: 0xF87171))
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12)
                }
                Button { onSubmit(day, month, year) } label: {
                    HStack(spacing: 8) {
                        if submitting {
                            ProgressView().tint(.white)
                            Text("agecheck.submitting")
                        } else {
                            Text("agecheck.submit")
                            Image(systemName: "arrow.right")
                        }
                    }
                    .font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(Self.ctaGradient)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .opacity(canSubmit || submitting ? 1 : 0.6)
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit)
                .padding(.top, 16)
                .accessibilityIdentifier("age-submit")

                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "lock.fill").font(.system(size: 14)).foregroundStyle(Color(hex: 0x93C5FD))
                        .frame(width: 40, height: 40)
                        .background(Color(hex: 0x3B82F6).opacity(0.10))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("agecheck.privacy.title").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.85))
                        Text("agecheck.privacy.body").font(.system(size: 13)).foregroundStyle(Self.muted)
                    }
                }
                .padding(14)
                .background(Color.white.opacity(0.03))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Self.line, lineWidth: 1))
                .padding(.top, 14)
            }
        }
        .padding(22)
        .frame(maxWidth: 560)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Self.line, lineWidth: 1))
    }

    private var yearOptions: [String] {
        let now = Calendar(identifier: .gregorian).component(.year, from: Date())
        return stride(from: now, through: now - 100, by: -1).map(String.init)
    }

    private func dateField(_ label: LocalizedStringKey, value: Binding<String>, placeholder: String,
                           options: [String], id: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.system(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
            Menu {
                ForEach(options, id: \.self) { o in
                    Button(o) { value.wrappedValue = o; onEdit() }
                }
            } label: {
                HStack {
                    Text(value.wrappedValue.isEmpty ? placeholder : value.wrappedValue)
                        .font(.system(size: 16))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .foregroundStyle(value.wrappedValue.isEmpty ? .white.opacity(0.35) : .white)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down").font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
                }
                .padding(.horizontal, 12).padding(.vertical, 13)
                .frame(maxWidth: .infinity)
                .background(Color.white.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Self.line, lineWidth: 1))
            }
            .accessibilityIdentifier(id)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Intro / trust

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("agecheck.intro.eyebrow").font(.system(size: 11, weight: .bold)).tracking(2)
                .foregroundStyle(Color(hex: 0x60A5FA).opacity(0.9))
            (Text("agecheck.intro.lead") + Text("\n") + Text("agecheck.intro.accent").foregroundColor(Color(hex: 0x7DB8FF)))
                .font(.system(size: 28, weight: .black)).foregroundStyle(.white)
            Text("agecheck.intro.desc").font(.system(size: 15)).foregroundStyle(Self.muted)
            feature("bubble.left", Color(hex: 0x93C5FD), "agecheck.feature.discover.title", "agecheck.feature.discover.desc")
            feature("bag", Color(hex: 0xC4B5FD), "agecheck.feature.shop.title", "agecheck.feature.shop.desc")
            feature("person.3", Color(hex: 0x6EE7B7), "agecheck.feature.together.title", "agecheck.feature.together.desc")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func feature(_ icon: String, _ tint: Color, _ title: LocalizedStringKey, _ desc: LocalizedStringKey) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 17)).foregroundStyle(tint)
                .frame(width: 44, height: 44).background(tint.opacity(0.16))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Self.line, lineWidth: 1))
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(.white.opacity(0.9))
                Text(desc).font(.system(size: 13)).foregroundStyle(.white.opacity(0.5))
            }
        }
    }

    private var trust: some View {
        VStack(alignment: .leading, spacing: 16) {
            trustRow("lock.fill", Color(hex: 0x6EE7B7), "agecheck.trust.privacy.title", "agecheck.trust.privacy.desc")
            trustRow("eye.slash.fill", Color(hex: 0x93C5FD), "agecheck.trust.ageOnly.title", "agecheck.trust.ageOnly.desc")
            trustRow("checkmark.shield.fill", Color(hex: 0xC4B5FD), "agecheck.trust.better.title", "agecheck.trust.better.desc")
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.02))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    private func trustRow(_ icon: String, _ tint: Color, _ title: LocalizedStringKey, _ desc: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.system(size: 15)).foregroundStyle(tint)
                .frame(width: 40, height: 40).background(tint.opacity(0.12)).clipShape(Circle())
                .overlay(Circle().stroke(tint.opacity(0.25), lineWidth: 1))
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(.white.opacity(0.85))
                Text(desc).font(.system(size: 12)).foregroundStyle(.white.opacity(0.45))
            }
        }
    }
}
