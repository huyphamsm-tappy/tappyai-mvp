import SwiftUI
import UIKit

/// Mirrors the web /subscription page. Full purchase flow via StoreKit 2 (ADR-006).
struct SubscriptionView: View {
    let deps: AppDependencies

    @State private var status: SubscriptionStatusResponse?
    @State private var storeProduct: AppProduct?
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

    // ONLY what the server really differs on: the daily AI allowance (Free 10, Pro 30) and AI features open to both.
    // No priority, voice, memory, history or search promises: the backend has no such plan difference
    // (Guideline 3.1.2: the subscription must describe what the person gets).
    private let freeFeatures = [
        NSLocalizedString("sub.free.messages", comment: ""),
    ]
    private let proFeatures = [
        NSLocalizedString("sub.pro.messages", comment: ""),
        NSLocalizedString("sub.pro.allAI", comment: ""),
    ]

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

    /// The buy button and the StoreKit price are shown only in a build that turns the purchase UI on.
    private var purchaseUI: Bool { ProductFlags.iapPurchaseUI }

    // MARK: - Hero

    private var heroSection: some View {
        VStack(spacing: Spacing.sm) {
            ZStack {
                RoundedRectangle(cornerRadius: Radius.xl)
                    .fill(
                        LinearGradient(
                            colors: [Color(red: 251/255, green: 191/255, blue: 36/255),
                                     Color(red: 249/255, green: 115/255, blue: 22/255)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 64, height: 64)
                    .shadow(color: Color.orange.opacity(0.25), radius: 12, x: 0, y: 4)
                Image(systemName: "crown.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.white)
            }
            Text("TappyAI Pro")
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(TappyColor.textPrimary)
            Text("sub.hero.desc")
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.sm)
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
        } else {
            HStack(spacing: 0) {
                Text(NSLocalizedString("sub.freeBanner.prefix", comment: ""))
                    .font(.system(size: 13, weight: .medium))
                Text("\(s.remaining) / \(s.freeDailyLimit)")
                    .font(.system(size: 13, weight: .bold))
                Text(NSLocalizedString("sub.freeBanner.suffix", comment: ""))
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundStyle(Color(red: 29/255, green: 78/255, blue: 216/255))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(Color(red: 239/255, green: 246/255, blue: 255/255))
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(Color(red: 219/255, green: 234/255, blue: 254/255), lineWidth: 1))
        }
    }

    // MARK: - Pricing Cards

    @ViewBuilder
    private func pricingCards(_ s: SubscriptionStatusResponse) -> some View {
        VStack(spacing: Spacing.md) {
            freeCard(s)
            proCard(s)
        }
    }

    private func freeCard(_ s: SubscriptionStatusResponse) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("sub.free")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("sub.free.desc")
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    Text(verbatim: "0đ")
                        .font(.system(size: 22, weight: .black))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("sub.perMonth")
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                ForEach(freeFeatures, id: \.self) { f in
                    featureRow(f, tint: TappyColor.textSecondary)
                }
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
                            Text("sub.pro")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        Text("sub.pro.desc")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 0) {
                        if !purchaseUI {
                            EmptyView()
                        } else if productLoading && storeProduct == nil {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .frame(height: 26)
                            Text("sub.perMonth")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.7))
                        } else if let p = storeProduct {
                            Text(p.displayPrice)
                                .font(.system(size: 22, weight: .black))
                                .foregroundStyle(.white)
                            Text("sub.perMonth")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.7))
                        } else {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 16))
                                .foregroundStyle(Color(red: 252/255, green: 211/255, blue: 77/255))
                                .frame(height: 26)
                            Text("common.retry.action")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.white.opacity(0.8))
                        }
                    }
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
                        if let p = storeProduct {
                            Button { Task { await doPurchase() } } label: {
                                Group {
                                    if purchaseLoading {
                                        ProgressView().tint(.white)
                                    } else {
                                        Text(String(format: NSLocalizedString("sub.upgradeProPrice", comment: ""), p.displayPrice))
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundStyle(.white)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 44)
                                .background(Color.white.opacity(0.25))
                                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                            }
                            .buttonStyle(.plain)
                            .disabled(purchaseLoading)
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
                        if storeProduct == nil && !productLoading {
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
            Text(text).font(.system(size: 13)).foregroundStyle(textColor)
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

    private func doPurchase() async {
        guard storeProduct != nil else {
            productError = NSLocalizedString("sub.error.loadFailed", comment: "")
            return
        }
        purchaseLoading = true
        purchaseError = nil
        purchasePending = false
        do {
            let result = try await deps.paymentProvider.purchase()
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
            if let p = try await deps.paymentProvider.availableProduct() {
                storeProduct = p
                productError = nil
            } else {
                storeProduct = nil
                productError = NSLocalizedString("sub.error.loadFailed", comment: "")
                result = "empty"
            }
        } catch let appErr as AppError {
            storeProduct = nil
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
            storeProduct = nil
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
