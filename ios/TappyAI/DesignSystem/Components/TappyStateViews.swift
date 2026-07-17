import SwiftUI

/// Loading spinner (brand-tinted).
struct TappyLoadingIndicator: View {
    var body: some View {
        ProgressView()
            .tint(TappyColor.primary)
            .accessibilityLabel(Text("Loading"))
    }
}

/// Empty state: icon + title + message + optional primary action (docs/ios/06).
struct TappyEmptyState: View {
    let systemImage: String
    let title: LocalizedStringKey
    var message: LocalizedStringKey? = nil
    var actionTitle: LocalizedStringKey? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: Spacing.sm) {
            Image(systemName: systemImage)
                .font(.system(size: 44))
                .foregroundStyle(TappyColor.textSecondary)
                .accessibilityHidden(true)
            Text(title).font(TappyFont.headline).foregroundStyle(TappyColor.textPrimary)
            if let message { Text(message).font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary).multilineTextAlignment(.center) }
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.tappy(.tertiary)).padding(.top, Spacing.xs)
            }
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity)
    }
}

/// Error state with an optional retry (retry availability comes from `AppError.isRetriable`).
struct TappyErrorState: View {
    let presentation: ErrorPresenter.Presentation
    var onRetry: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: Spacing.sm) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40)).foregroundStyle(TappyColor.danger)
                .accessibilityHidden(true)
            Text(presentation.title).font(TappyFont.headline).foregroundStyle(TappyColor.textPrimary)
            Text(presentation.message).font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary).multilineTextAlignment(.center)
            if presentation.retryable, let onRetry {
                Button("common.retry", action: onRetry).buttonStyle(.tappy(.primary)).padding(.top, Spacing.xs)
            }
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity)
    }
}

/// Skeleton placeholder block with a subtle shimmer. Apply `.tappySkeleton(active:)` to real
/// content to redact it while loading.
struct TappySkeleton: View {
    var cornerRadius: CGFloat = Radius.sm
    @State private var phase: CGFloat = -1
    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(TappyColor.surface)
            .overlay(
                LinearGradient(colors: [.clear, TappyColor.surfaceElevated.opacity(0.8), .clear],
                               startPoint: .leading, endPoint: .trailing)
                    .offset(x: phase * 220)
                    .mask(RoundedRectangle(cornerRadius: cornerRadius))
            )
            .onAppear {
                phase = -1
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { phase = 1.4 }
            }
            .accessibilityHidden(true)
    }
}

extension View {
    /// Redact content with the system placeholder while loading.
    @ViewBuilder func tappySkeleton(active: Bool) -> some View {
        if active { self.redacted(reason: .placeholder) } else { self }
    }
}
