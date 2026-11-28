import SwiftUI
import UIKit

/// Mirrors the web /subscription page. Full purchase flow via StoreKit 2 (ADR-006).
struct SubscriptionView: View {
    let deps: AppDependencies

    @State private var status: SubscriptionStatusResponse?
    /// The plans the App Store served, in the catalog's order.
    @State private var plans: [AppProduct] = []
    @State private var buyingProductId: String?
    @State private var loading = true
    @State private var errorMessage: String?

    // StoreKit product loading state
    @State private var productLoading = false
    @State private var productError: String?
    @State private var diagnosticsCopied = false

    @State private var purchaseLoading = false
    @State private var purchaseError: String?
    @State private var purchasePending = false

    @State private var restoreLoading = false
    @State private var restoreMessage: String?

    // ONLY what the server really differs on: the daily AI allowance and AI features open to paid plans.
    // No priority, voice, memory, history or search promises: the backend has no such plan difference
    // (Guideline 3.1.2: the subscription must describe what the person gets).
    // The Free card states no daily count (owner 28/11). These are KEYS, resolved by `Text` in the app's own language: a string
    // read with `NSLocalizedString` follows the phone's language, not the one chosen in the app (English screen, Vietnamese lines).
    // The web's lines (28/11): the paid plans' allowance is stated as on the web.
    private let proFeatures = ["sub.plan.quota", "sub.plan.allAi"]

    /// The tagline and the extra line under a plan's name, in the app language (the web's `sub.plan.*.tagline` / `.extra`).
    private func planLines(_ productId: String) -> (tagline: LocalizedStringKey, extra: LocalizedStringKey, trial: Bool) {
        switch productId {
        case ProductCatalog.pipId: return ("sub.plan.pip.tagline", "sub.plan.pip.extra", true)
        case "tappy_promax_1m": return ("sub.plan.promax1m.tagline", "sub.plan.promax1m.extra", false)
        case "tappy_coco_3m": return ("sub.plan.coco.tagline", "sub.plan.coco.extra", false)
        case "tappy_promax_3m": return ("sub.plan.promax3m.tagline", "sub.plan.promax3m.extra", false)
        default: return ("sub.plan.momo.tagline", "sub.plan.momo.extra", false)
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 200)
                } else if let msg = errorMessage {
                    errorView(msg)
                } else if let s = status {
                    heroSection
                    statusCard(s)
                    pricingCards(s)
                    // Always reachable (Apple: «a way for current subscribers to sign in or restore purchases»).
                    restoreRow
                    subscriptionTermsSection
                    faqCard
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("sub.title")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            async let a: () = loadStatus()
            async let b: () = loadProduct()
            await a; await b
        }
    }

    /// The plans offered now: the 7-day pack only when the server said the account has not used it (absent answer = not offered).
    private var visiblePlans: [AppProduct] {
        let offersPip = status?.offersPipPack ?? false
        return plans.filter { $0.id != ProductCatalog.pipId || offersPip }
    }

    @ViewBuilder
    private func planRow(_ p: AppProduct) -> some View {
        let plan = ProductCatalog.salePlan(for: p.id)
        Button { Task { await doPurchase(productId: p.id) } } label: {
            HStack(spacing: Spacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: plan?.name ?? p.displayName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                    if plan != nil {
                        let lines = planLines(p.id)
                        Text(lines.tagline)
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.85))
                        // The one-time pack says so on its card, as on the web: one trial per account, no auto-renewal.
                        if lines.trial {
                            Text("sub.trial.once")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                        Text(lines.extra)
                            .font(.system(size: 10))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }
                Spacer()
                if buyingProductId == p.id {
                    ProgressView().tint(.white)
                } else {
                    Text(verbatim: p.displayPrice)
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(.white)
                }
            }
            .padding(.horizontal, Spacing.md)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 52)
            .background(Color.white.opacity(0.25))
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
        .disabled(purchaseLoading)
        .accessibilityIdentifier("sub-plan-\(p.id)")
    }

    /// The buy button and the StoreKit price are shown only in a build that turns the purchase UI on.
    private var purchaseUI: Bool { ProductFlags.iapPurchaseUI }

    // MARK: - Hero

    private var heroSection: some View {
        VStack(spacing: Spacing.sm) {
            // The web's hero: badge «Nâng cấp Tappy», «Khám phá nhiều hơn cùng Tappy», one sentence and three benefits.
            Text("sub.hero.badge")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(TappyColor.primary)
                .padding(.horizontal, 12).padding(.vertical, 5)
                .background(TappyColor.primary.opacity(0.12), in: Capsule())
            (Text("sub.hero.title") + Text(" ") + Text("sub.hero.with") + Text(" ") + Text(verbatim: "Tappy").foregroundColor(TappyColor.primary))
                .font(.system(size: 24, weight: .black))
                .foregroundStyle(TappyColor.textPrimary)
                .multilineTextAlignment(.center)
            Text("sub.hero.body")
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: Spacing.sm) {
                benefitRow("sparkles", "sub.benefit.ai", "sub.benefit.ai.desc")
                benefitRow("heart.fill", "sub.benefit.personal", "sub.benefit.personal.desc")
                benefitRow("star.fill", "sub.benefit.full", "sub.benefit.full.desc")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, Spacing.xs)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.sm)
    }

    private func benefitRow(_ icon: String, _ title: LocalizedStringKey, _ desc: LocalizedStringKey) -> some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: icon).font(.system(size: 15)).foregroundStyle(TappyColor.primary)
                .frame(width: 36, height: 36)
                .background(TappyColor.primary.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.system(size: 14, weight: .bold)).foregroundStyle(TappyColor.textPrimary)
                Text(desc).font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
            }
        }
    }

    // MARK: - Status Card

    @ViewBuilder
    private func statusCard(_ s: SubscriptionStatusResponse) -> some View {
        if s.isPro {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "crown.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Color(red: 217/255, green: 119/255, blue: 6/255))
                VStack(alignment: .leading, spacing: 2) {
                    // A renewal date is stated only for an App Store subscription; any other paid plan is
                    // shown as active, without «Gia hạn» (it does not renew through Apple).
                    Text(LocalizedStringKey(s.isAppleSubscription ? "sub.onPro" : "sub.external.title"))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color(red: 146/255, green: 64/255, blue: 14/255))
                    if s.isAppleSubscription, let end = s.currentPeriodEnd {
                        Text(String(format: NSLocalizedString("sub.renewalDate", comment: ""), formatDate(end)))
                            .font(.system(size: 11))
                            .foregroundStyle(Color(red: 180/255, green: 83/255, blue: 9/255))
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(
                LinearGradient(
                    colors: [Color(red: 255/255, green: 251/255, blue: 235/255),
                             Color(red: 255/255, green: 237/255, blue: 213/255)],
                    startPoint: .leading, endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(Color(red: 253/255, green: 230/255, blue: 138/255), lineWidth: 1))
        }
        // A Free account gets no banner: the Free plan states no daily message count (owner 28/11).
    }

    // MARK: - Pricing Cards

    @ViewBuilder
    private func pricingCards(_ s: SubscriptionStatusResponse) -> some View {
        VStack(spacing: Spacing.md) {
            // The Free card is for a Free account only. With ANY paid plan (App Store or bought elsewhere) it is not shown
            // at all: no card, no label of the Free plan next to «You're on Pro».
            if s.showsFreeCard { freeCard(s) }
            proCard(s)
        }
    }

    private func freeCard(_ s: SubscriptionStatusResponse) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    // The free tier is called Pip, as on the web (the paid 7-day pack is MoMo).
                    Text("sub.freeTier.name")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("sub.freeTier.tagline")
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    Text("sub.price.free")
                        .font(.system(size: 18, weight: .black))
                        .foregroundStyle(TappyColor.textPrimary)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                featureRow("sub.free.quota", tint: TappyColor.textSecondary)
                featureRow("sub.free.most", tint: TappyColor.textSecondary)
            }
            // «Current plan» only while the account really is on Free. With ANY paid plan (App Store or bought
            // elsewhere) the Free card carries no such mark: it would contradict «You're on Pro».
            if s.freePlanIsCurrent {
                Text("sub.current")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(TappyColor.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.sm + 2)
                    .overlay(RoundedRectangle(cornerRadius: Radius.lg)
                        .stroke(TappyColor.border, lineWidth: 1))
                    .accessibilityIdentifier("sub-free-current")
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl)
            .stroke(TappyColor.border, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("sub-free-card")
    }

    @ViewBuilder
    private func proCard(_ s: SubscriptionStatusResponse) -> some View {
        ZStack(alignment: .topTrailing) {
            Circle()
                .fill(Color.white.opacity(0.1))
                .frame(width: 128, height: 128)
                .offset(x: 32, y: -32)

            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Image(systemName: "crown.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(Color(red: 252/255, green: 211/255, blue: 77/255))
                            Text("sub.list.title")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    Spacer()
                    // No single price up here any more: each plan below carries its own, from the App Store.
                }

                VStack(alignment: .leading, spacing: 8) {
                    ForEach(proFeatures, id: \.self) { f in
                        featureRow(f, tint: Color.green.opacity(0.8), textColor: .white)
                    }
                }

                // Action area
                if s.isPro {
                    VStack(spacing: Spacing.sm) {
                        HStack(spacing: Spacing.sm) {
                            Image(systemName: "crown.fill").font(.system(size: 14))
                            Text("sub.alreadyPro").font(.system(size: 13, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm + 2)
                        .background(.white.opacity(0.2))
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

                        if s.isAppleSubscription {
                            // Apple's own subscription screen: offered only for a plan that IS an App Store subscription.
                            Button { Task { await deps.paymentProvider.openSubscriptionManagement() } } label: {
                                Text("sub.manage")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.8))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, Spacing.sm)
                                    .background(.white.opacity(0.1))
                                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                            }
                            .buttonStyle(.plain)
                        } else {
                            Text("sub.external.note")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.8))
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                        }
                    }
                } else if !purchaseUI {
                    EmptyView()
                } else if purchasePending {
                    Text("sub.pending")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.9))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(Spacing.sm)
                        .background(.white.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                } else {
                    VStack(spacing: Spacing.xs) {
                        if !visiblePlans.isEmpty {
                            ForEach(visiblePlans, id: \.id) { p in planRow(p) }
                            // MoMo is a one-time trial: said again under the list, as the web's payment note does.
                            if visiblePlans.contains(where: { $0.id == ProductCatalog.pipId }) {
                                Text("sub.trial.note")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.85))
                                    .multilineTextAlignment(.center)
                                    .frame(maxWidth: .infinity)
                                    .padding(.top, Spacing.xs)
                            }
                        } else if productLoading {
                            HStack(spacing: Spacing.xs) {
                                ProgressView().tint(.white)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .background(Color.white.opacity(0.18))
                            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                        } else {
                            Button { Task { await loadProduct() } } label: {
                                HStack(spacing: Spacing.xs) {
                                    Image(systemName: "arrow.clockwise")
                                    Text("sub.retryStore")
                                }
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 44)
                                .background(Color.white.opacity(0.22))
                                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                            }
                            .buttonStyle(.plain)
                        }

                        if let err = purchaseError ?? productError {
                            Text(err)
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.85))
                                .multilineTextAlignment(.center)
                        }
                        if plans.isEmpty && !productLoading {
                            diagnosticsButton(tint: .white.opacity(0.85))
                        }
                    }
                }
            }
            .padding(Spacing.lg)
        }
        .background(
            LinearGradient(
                colors: [TappyColor.primary,
                         Color(red: 99/255, green: 102/255, blue: 241/255)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .clipped()
    }

    @ViewBuilder
    private func featureRow(_ text: String, tint: Color, textColor: Color = TappyColor.textPrimary) -> some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "checkmark").font(.system(size: 11)).foregroundStyle(tint)
            Text(LocalizedStringKey(text)).font(.system(size: 13)).foregroundStyle(textColor)
        }
    }

    // MARK: - Restore

    private var restoreRow: some View {
        VStack(spacing: 4) {
            Button {
                Task { await doRestore() }
            } label: {
                Group {
                    if restoreLoading {
                        ProgressView().tint(TappyColor.primary)
                    } else {
                        Text("sub.restore")
                            .font(.system(size: 13))
                            .foregroundStyle(TappyColor.primary)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(restoreLoading)

            if let msg = restoreMessage {
                Text(msg)
                    .font(.system(size: 11))
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Legal and Subscription Disclosure (App Store Guideline 3.1.2)

    private var subscriptionTermsSection: some View {
        VStack(spacing: Spacing.xs) {
            Text("sub.terms.autoRenewNotice")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.sm)

            HStack(spacing: Spacing.md) {
                if let termsUrl = URL(string: "https://www.tappyai.com/terms") {
                    Link(destination: termsUrl) {
                        Text("settings.terms")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(TappyColor.primary)
                    }
                }
                Text("•")
                    .font(.system(size: 10))
                    .foregroundStyle(TappyColor.textSecondary.opacity(0.5))
                if let privacyUrl = URL(string: "https://www.tappyai.com/privacy") {
                    Link(destination: privacyUrl) {
                        Text("settings.privacyPolicy")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(TappyColor.primary)
                    }
                }
            }
            .padding(.top, 2)
            // Always here (it was shown only when the store product failed to load): the owner copies the diagnostics from this footer after
            // a stuck chat, on any state of this screen.
            diagnosticsButton(tint: TappyColor.textSecondary)
                .padding(.top, Spacing.xs)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.xs)
    }

    // MARK: - FAQ

    private var faqCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("sub.faq")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            faqRow(NSLocalizedString("sub.faq.payment.q", comment: ""),
                   NSLocalizedString("sub.faq.payment.a", comment: ""))
            faqRow(NSLocalizedString("sub.faq.cancel.q", comment: ""),
                   NSLocalizedString("sub.faq.cancel.a", comment: ""))
            faqRow(NSLocalizedString("sub.faq.reset.q", comment: ""),
                   NSLocalizedString("sub.faq.reset.a", comment: ""))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl)
            .stroke(TappyColor.border, lineWidth: 1))
    }

    @ViewBuilder
    private func faqRow(_ question: String, _ answer: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(question)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(TappyColor.textPrimary)
            Text(answer)
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)
        }
    }

    // MARK: - Error

    @ViewBuilder
    private func errorView(_ message: String) -> some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 32))
                .foregroundStyle(TappyColor.textSecondary)
            Text(message)
                .font(.system(size: 14))
                .foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
            Button("common.retry.action") {
                Task {
                    async let a: () = loadStatus()
                    async let b: () = loadProduct()
                    await a; await b
                }
            }
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(TappyColor.primary)
            diagnosticsButton(tint: TappyColor.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.xl)
    }

    /// Copies the in-memory diagnostic snapshot. Runs only when the user taps the button.
    private func diagnosticsButton(tint: Color) -> some View {
        Button {
            UIPasteboard.general.string = DiagnosticSnapshot.shared.snapshot()
            diagnosticsCopied = true
        } label: {
            Text(diagnosticsCopied
                 ? NSLocalizedString("sub.diag.copied", comment: "")
                 : NSLocalizedString("sub.diag.copy", comment: ""))
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(tint)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Actions

    private func doPurchase(productId: String) async {
        guard plans.contains(where: { $0.id == productId }) else {
            productError = NSLocalizedString("sub.error.loadFailed", comment: "")
            return
        }
        purchaseLoading = true
        buyingProductId = productId
        defer { buyingProductId = nil }
        purchaseError = nil
        purchasePending = false
        do {
            let result = try await deps.paymentProvider.purchase(productId: productId)
            switch result {
            case .success:
                await loadStatus()
            case .cancelled:
                break
            case .pending:
                purchasePending = true
            }
        } catch {
            purchaseError = NSLocalizedString("sub.error.purchase", comment: "")
        }
        purchaseLoading = false
    }

    private func doRestore() async {
        restoreLoading = true
        restoreMessage = nil
        do {
            let found = try await deps.paymentProvider.restorePurchases()
            if found {
                await loadStatus()
                restoreMessage = NSLocalizedString("sub.restore.ok", comment: "")
            } else {
                restoreMessage = NSLocalizedString("sub.restore.none", comment: "")
            }
        } catch {
            restoreMessage = NSLocalizedString("sub.restore.failed", comment: "")
        }
        restoreLoading = false
    }

    // MARK: - Data

    private func loadStatus() async {
        let started = Date()
        DiagnosticSnapshot.shared.record("Subscription status start")
        loading = true
        errorMessage = nil
        do {
            let endpoint = Endpoint(path: "/api/subscription", method: .get, requiresAuth: true)
            let data = try await deps.api.send(endpoint)
            status = try ResponseDecoder.json.decode(SubscriptionStatusResponse.self, from: data)
            if let status { ProUpsellState.shared.apply(isPro: status.isPro, signedIn: deps.session.state.isAuthenticated) }
            DiagnosticSnapshot.shared.record("Subscription status=success")
        } catch AppError.authentication {
            DiagnosticSnapshot.shared.record("Subscription status=error AppError.authentication", isError: true)
            errorMessage = NSLocalizedString("sub.error.signInRequired", comment: "")
        } catch AppError.offline {
            DiagnosticSnapshot.shared.record("Subscription status=error AppError.offline", isError: true)
            errorMessage = NSLocalizedString("sub.error.offline", comment: "")
        } catch {
            DiagnosticSnapshot.shared.record("Subscription status=error \(error.diagnosticTag)", isError: true)
            errorMessage = NSLocalizedString("sub.error.loadFailed", comment: "")
        }
        loading = false
        let render = errorMessage != nil ? "error" : (status != nil ? "pricing" : "none")
        DiagnosticSnapshot.shared.record("Subscription render=\(render) ms=\(Int(Date().timeIntervalSince(started) * 1000))")
    }

    private func loadProduct() async {
        let started = Date()
        DiagnosticSnapshot.shared.record("Product load start")
        productLoading = true
        productError = nil
        var result = "success"
        do {
            let served = try await deps.paymentProvider.availableProducts()
            plans = served
            if served.isEmpty {
                productError = NSLocalizedString("sub.error.loadFailed", comment: "")
                result = "empty"
            } else {
                productError = nil
            }
        } catch let appErr as AppError {
            plans = []
            result = Self.productResult(appErr)
            switch appErr {
            case .offline:
                productError = NSLocalizedString("sub.error.offline", comment: "")
            case .unexpected(let msg):
                productError = msg
            default:
                productError = appErr.localizedDescription
            }
        } catch {
            plans = []
            result = Self.productResult(error)
            productError = error.localizedDescription
        }
        productLoading = false
        let ms = Int(Date().timeIntervalSince(started) * 1000)
        DiagnosticSnapshot.shared.record("Product load result=\(result) ms=\(ms)", isError: result.hasPrefix("error"))
    }

    /// Snapshot category for a thrown error: cancellation is its own outcome, anything else is a safe tag.
    private static func productResult(_ error: Error) -> String {
        if error is CancellationError { return "cancelled" }
        if let appErr = error as? AppError, appErr == .cancellation { return "cancelled" }
        return "error \(error.diagnosticTag)"
    }

    private func formatDate(_ iso: String) -> String {
        guard let date = ISO8601Timestamp.date(from: iso) else { return iso }
        let df = DateFormatter()
        df.locale = Locale(identifier: "vi_VN")
        df.dateFormat = "dd/MM/yyyy"
        return df.string(from: date)
    }
}
