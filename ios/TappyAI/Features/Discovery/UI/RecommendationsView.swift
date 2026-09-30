import SwiftUI

/// "Gợi ý cho bạn" — mockup Sep 22 01_41 = the web page = Android `RecommendationsScreen`: hero with
/// the accent "gần bạn", three highlights, mascot + bubble; "Địa điểm nổi bật gần đây · Xem thêm";
/// cards (photo + rank, name, address, rating / recently active / review-count chips, "Hỏi Tappy về
/// chỗ này"); the footer. Only facts the server sent are drawn. A 403 from the 18+ gate opens the
/// full-screen age check (a guest who already declared is invited to sign in instead — the route
/// does not read the guest declaration, ANDROID-REQUESTS R6).
struct RecommendationsView: View {
    let deps: AppDependencies
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var session: SessionStore

    @State private var recs: [Recommendation] = []
    @State private var explanation: [String] = []
    @State private var personalized = false
    @State private var loading = true
    @State private var error: String?
    @State private var signInNeeded = false
    @State private var showAuth = false
    @State private var ageScreen = false
    @State private var ageBlocked = false
    @State private var ageSubmitting = false
    @State private var ageFormError: String?

    private var placesService: PlacesService { PlacesService(api: deps.api) }
    private let accent = Color(hex: 0x3391FF)
    private let amber = Color(hex: 0xF59E0B)
    private let emerald = Color(hex: 0x10B981)
    private var isGuest: Bool { !session.state.isAuthenticated }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                hero
                sectionHeader
                if loading { ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40) }
                else if signInNeeded { signInCard }
                else if let error { errorCard(error) }
                else if recs.isEmpty { emptyState }
                else {
                    explanationTags
                    recsList
                }
                footer
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.md)
        }
        .background(TappyColor.background)
        .navigationTitle("recommendations.title")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadRecommendations() }
        .fullScreenCover(isPresented: $ageScreen) {
            AgeCheckView(
                isGuest: isGuest,
                blocked: ageBlocked,
                submitting: ageSubmitting,
                formError: ageFormError,
                onSubmit: { d, m, y in Task { await submitAge(day: d, month: m, year: y) } },
                onEdit: { ageFormError = nil },
                onClose: { ageScreen = false; router.pop(on: .home) }
            )
        }
        .fullScreenCover(isPresented: $showAuth) {
            AuthFlowView(repo: deps.authRepository, config: deps.configService) {
                showAuth = false
                Task { await loadRecommendations() }
            }
        }
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    (Text("recommendations.hero.lead") + Text(" ") + Text("recommendations.hero.accent").foregroundColor(accent))
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("recommendations.hero.subtitle")
                        .font(.system(size: 14))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                Spacer(minLength: 0)
                ZStack(alignment: .topTrailing) {
                    Image("TappyWave").resizable().scaledToFit().frame(width: 104, height: 104)
                        .frame(maxHeight: .infinity, alignment: .bottom)
                    Text("recommendations.hero.bubble")
                        .font(.system(size: 10, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 5)
                        .background(accent)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .frame(width: 118, height: 130)
                .accessibilityHidden(true)
            }
            ChatFlowLayout(spacing: 16) {
                highlight("mappin.and.ellipse", accent, "recommendations.highlight.discover")
                highlight("person.3", Color(hex: 0x818CF8), "recommendations.highlight.community")
                highlight("heart", Color(hex: 0xEC4899), "recommendations.highlight.life")
            }
        }
        .accessibilityIdentifier("recs-hero")
    }

    private func highlight(_ icon: String, _ tint: Color, _ text: LocalizedStringKey) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 15)).foregroundStyle(tint)
                .frame(width: 38, height: 38).background(tint.opacity(0.12)).clipShape(Circle())
                .overlay(Circle().stroke(tint.opacity(0.3), lineWidth: 1))
            Text(text).font(.system(size: 13)).foregroundStyle(TappyColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 130, alignment: .leading)
        }
    }

    private var sectionHeader: some View {
        HStack {
            Image(systemName: "mappin.and.ellipse").font(.system(size: 15)).foregroundStyle(accent)
            Text(LocalizedStringKey(personalized ? "recommendations.personalized" : "recommendations.popularNearby"))
                .font(.system(size: 15, weight: .semibold)).foregroundStyle(TappyColor.textPrimary)
            Spacer()
            Button { router.switchTo(.explore) } label: {
                HStack(spacing: 2) {
                    Text("recommendations.seeMore").font(.system(size: 13, weight: .medium))
                    Image(systemName: "chevron.right").font(.system(size: 11))
                }
                .foregroundStyle(accent)
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 8)
    }

    // MARK: - States

    private func errorCard(_ message: String) -> some View {
        Text(message)
            .font(TappyFont.callout)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(Color.red.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(Color.red.opacity(0.2), lineWidth: 1))
            .onTapGesture { Task { await loadRecommendations() } }
    }

    private var signInCard: some View {
        VStack(spacing: Spacing.sm) {
            Text("recommendations.error.signInRequired")
                .font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
            Button { showAuth = true } label: {
                Text("profile.guest.signIn").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .background(accent).clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("recs-signin")
        }
        .frame(maxWidth: .infinity).padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(TappyColor.border, lineWidth: 1))
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image("TappyWave").resizable().scaledToFit().frame(width: 56, height: 56)
            Text("recommendations.empty.title").font(.system(size: 14)).foregroundStyle(TappyColor.textSecondary)
            Text("recommendations.empty.detail").font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, 32)
    }

    private var explanationTags: some View {
        Group {
            if !explanation.isEmpty {
                ChatFlowLayout(spacing: 8) {
                    ForEach(explanation, id: \.self) { tag in chip(tag, accent) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func chip(_ text: String, _ tint: Color) -> some View {
        Text(text).font(.system(size: 12)).foregroundStyle(tint)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(tint.opacity(0.10)).clipShape(Capsule())
            .overlay(Capsule().stroke(tint.opacity(0.3), lineWidth: 1))
    }

    // MARK: - Cards

    private var recsList: some View {
        ForEach(Array(recs.enumerated()), id: \.element.id) { index, rec in
            VStack(spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    photo(rec, rank: index + 1)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(rec.placeName.isEmpty ? NSLocalizedString("recommendations.placeFallback", comment: "") : rec.placeName)
                            .font(.system(size: 16, weight: .semibold)).foregroundStyle(TappyColor.textPrimary).lineLimit(1)
                        if let address = rec.address, !address.isEmpty {
                            HStack(spacing: 4) {
                                Image(systemName: "mappin").font(.system(size: 10)).foregroundStyle(accent)
                                Text(address).font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary).lineLimit(1)
                            }
                        }
                        ChatFlowLayout(spacing: 6) {
                            if let r = rec.averageRating {
                                factChip(amber) {
                                    Text(String(format: "%.1f", r)).font(.system(size: 12, weight: .semibold)).foregroundStyle(amber)
                                    Image(systemName: "star.fill").font(.system(size: 10)).foregroundStyle(amber)
                                }
                            }
                            if rec.isRecentlyActive {
                                factChip(emerald) {
                                    Circle().fill(emerald).frame(width: 6, height: 6)
                                    Text("recommendations.recentlyActive").font(.system(size: 12)).foregroundStyle(emerald)
                                }
                            }
                            if let n = rec.reviewCount, n > 0 {
                                factChip(TappyColor.textSecondary) {
                                    Image(systemName: "person.2").font(.system(size: 10)).foregroundStyle(TappyColor.textSecondary)
                                    Text(String(format: NSLocalizedString("recommendations.reviewCount", comment: ""), n))
                                        .font(.system(size: 12)).foregroundStyle(TappyColor.textPrimary)
                                }
                            }
                            // The engine's English signals duplicate the fact chips; shown only for a server without facts.
                            if rec.averageRating == nil && rec.address == nil {
                                ForEach(Array(rec.matchedSignals.prefix(4)), id: \.self) { s in
                                    factChip(TappyColor.textSecondary) {
                                        Text(s).font(.system(size: 12)).foregroundStyle(TappyColor.textPrimary)
                                    }
                                }
                            }
                        }
                        .padding(.top, 4)
                    }
                    Spacer(minLength: 0)
                }
                HStack {
                    Button { ask(rec) } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "bubble.left.fill").font(.system(size: 13))
                            Text("recommendations.askAboutPlace").font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(accent).clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("recs-ask-\(index)")
                    Image(systemName: "chevron.right").font(.system(size: 14)).foregroundStyle(TappyColor.textSecondary)
                }
            }
            .padding(12)
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        }
    }

    private func photo(_ rec: Recommendation, rank: Int) -> some View {
        ZStack(alignment: .topLeading) {
            if let url = rec.photoUrl.flatMap(URL.init(string:)) {
                AsyncImage(url: url) { img in img.resizable().aspectRatio(contentMode: .fill) } placeholder: { Color.clear }
                    .frame(width: 84, height: 84).clipped()
            } else {
                Image(systemName: "mappin.and.ellipse").font(.system(size: 26)).foregroundStyle(accent)
                    .frame(width: 84, height: 84)
            }
            Text("\(rank)").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                .frame(width: 24, height: 24)
                .background(LinearGradient(colors: [accent, Color(hex: 0xA855F7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .clipShape(Circle()).padding(6)
        }
        .frame(width: 84, height: 84)
        .background(LinearGradient(colors: [accent.opacity(0.15), Color(hex: 0xA855F7).opacity(0.15)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func factChip<Content: View>(_ tint: Color, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 4, content: content)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(tint.opacity(0.10)).clipShape(Capsule())
            .overlay(Capsule().stroke(tint.opacity(0.3), lineWidth: 1))
    }

    private func ask(_ rec: Recommendation) {
        let name = rec.placeName.isEmpty ? NSLocalizedString("recommendations.thisPlace", comment: "") : rec.placeName
        router.chatSeed = String(format: NSLocalizedString("recommendations.askPrompt", comment: ""), name)
        router.popToRoot(on: .chat)
        router.switchTo(.chat)
    }

    private var footer: some View {
        VStack(spacing: 10) {
            HStack {
                Rectangle().fill(TappyColor.border).frame(width: 100, height: 1)
                Image(systemName: "sparkles").foregroundStyle(accent)
                Rectangle().fill(TappyColor.border).frame(width: 100, height: 1)
            }
            Text("recommendations.footer.line").font(.system(size: 16)).foregroundStyle(TappyColor.textPrimary)
                .multilineTextAlignment(.center)
            Image(systemName: "heart.fill").font(.system(size: 14)).foregroundStyle(accent)
            Text("recommendations.footer.cta").font(.system(size: 13)).foregroundStyle(TappyColor.textSecondary)
        }
        .padding(.top, 20).padding(.bottom, 24)
    }

    // MARK: - Load

    private func loadRecommendations() async {
        loading = true
        error = nil
        signInNeeded = false
        do {
            let response = try await placesService.fetchRecommendations()
            recs = response.recommendations
            explanation = response.explanation ?? []
            personalized = response.personalized ?? false
        } catch let err as AppError {
            if case .authentication(let reason) = err {
                if case .ageGate = reason {
                    // Guest who already declared: the route does not read the declaration → sign in.
                    if isGuest && GuestAgeStore().declaration != nil { signInNeeded = true }
                    else { ageBlocked = false; ageScreen = true }
                } else if isGuest {
                    signInNeeded = true
                } else {
                    error = NSLocalizedString("recommendations.error.signInRequired", comment: "")
                }
            } else {
                error = NSLocalizedString("recommendations.error.loadFailed", comment: "")
            }
        } catch {
            self.error = NSLocalizedString("recommendations.error.loadFailed", comment: "")
        }
        loading = false
    }

    private func submitAge(day: String, month: String, year: String) async {
        guard !ageSubmitting else { return }
        guard let iso = DateOfBirthInput.iso(day: day, month: month, year: year) else {
            ageFormError = NSLocalizedString("chat.age.error.invalid", comment: "")
            return
        }
        ageSubmitting = true
        defer { ageSubmitting = false }
        if isGuest {
            GuestAgeStore().save(iso)
            ageScreen = false
            await loadRecommendations()
            return
        }
        let result: Result<DateOfBirthUpdateResponse, Error>
        do { result = .success(try await ProfileService(api: deps.api).updateDateOfBirth(iso)) } catch { result = .failure(error) }
        switch AgeCorrectionOutcome.from(result) {
        case .resend:
            ageScreen = false
            await loadRecommendations()
        case .blocked, .correctionExhausted:
            ageBlocked = true
        case .formError(let text):
            ageFormError = text
        }
    }
}
