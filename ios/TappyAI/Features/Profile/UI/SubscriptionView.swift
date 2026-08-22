import SwiftUI

/// Mirrors the web /subscription page. Full purchase flow via StoreKit 2 (ADR-006).
struct SubscriptionView: View {
    let deps: AppDependencies

    @State private var status: SubscriptionStatusResponse?
    @State private var storeProduct: AppProduct?
    @State private var loading = true
    @State private var errorMessage: String?

    @State private var purchaseLoading = false
    @State private var purchaseError: String?
    @State private var purchasePending = false

    @State private var restoreLoading = false
    @State private var restoreMessage: String?

    // Feature lists mirror subscription/page.tsx FREE_FEATURES / PRO_FEATURES
    private let freeFeatures = [
        NSLocalizedString("sub.free.messages", comment: ""),
        NSLocalizedString("sub.free.search", comment: ""),
        NSLocalizedString("sub.free.history", comment: ""),
    ]
    private let proFeatures = [
        NSLocalizedString("sub.pro.messages", comment: ""),
        NSLocalizedString("sub.pro.search", comment: ""),
        NSLocalizedString("sub.pro.history", comment: ""),
        NSLocalizedString("sub.pro.voice", comment: ""),
        NSLocalizedString("sub.pro.memory", comment: ""),
        NSLocalizedString("sub.pro.priority", comment: ""),
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
                    if !s.isPro { restoreRow }
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
                    Text("sub.onPro")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color(red: 146/255, green: 64/255, blue: 14/255))
                    if let end = s.currentPeriodEnd {
                        Text("Gia hạn: \(formatDate(end))")
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
            freeCard
            proCard(s)
        }
    }

    private var freeCard: some View {
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
            Text("sub.current")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(TappyColor.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.sm + 2)
                .overlay(RoundedRectangle(cornerRadius: Radius.lg)
                    .stroke(TappyColor.border, lineWidth: 1))
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
                        Text(storeProduct?.displayPrice ?? "99K")
                            .font(.system(size: 22, weight: .black))
                            .foregroundStyle(.white)
                        Text("sub.perMonth")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.7))
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
                    }
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
                        Button { Task { await doPurchase() } } label: {
                            Group {
                                if purchaseLoading {
                                    ProgressView().tint(.white)
                                } else if let p = storeProduct {
                                    Text("Nâng cấp Pro — \(p.displayPrice)/tháng")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundStyle(.white)
                                } else {
                                    Text("common.comingSoon")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.8))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .background(
                                storeProduct != nil
                                    ? Color.white.opacity(0.25)
                                    : Color.white.opacity(0.12)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                        }
                        .buttonStyle(.plain)
                        .disabled(purchaseLoading || storeProduct == nil)

                        if let err = purchaseError {
                            Text(err)
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.85))
                                .multilineTextAlignment(.center)
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
            Button("common.retry.action") { Task { await loadStatus() } }
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(TappyColor.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.xl)
    }

    // MARK: - Actions

    private func doPurchase() async {
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
        loading = true
        errorMessage = nil
        do {
            let endpoint = Endpoint(path: "/api/subscription", method: .get, requiresAuth: true)
            let data = try await deps.api.send(endpoint)
            status = try ResponseDecoder.json.decode(SubscriptionStatusResponse.self, from: data)
        } catch AppError.authentication {
            errorMessage = NSLocalizedString("sub.error.signInRequired", comment: "")
        } catch AppError.offline {
            errorMessage = NSLocalizedString("sub.error.offline", comment: "")
        } catch {
            errorMessage = NSLocalizedString("sub.error.loadFailed", comment: "")
        }
        loading = false
    }

    private func loadProduct() async {
        storeProduct = try? await deps.paymentProvider.availableProduct()
    }

    private func formatDate(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return iso }
        let df = DateFormatter()
        df.locale = Locale(identifier: "vi_VN")
        df.dateFormat = "dd/MM/yyyy"
        return df.string(from: date)
    }
}
