import SwiftUI

/// Preview infrastructure for the DesignSystem — dependency-free so the canvas renders without the
/// app's environment objects. Feature previews wire their own sample data later.
#Preview("Buttons") {
    VStack(spacing: Spacing.md) {
        Button("Primary") {}.buttonStyle(.tappy(.primary))
        Button("Secondary") {}.buttonStyle(.tappy(.secondary))
        Button("Tertiary") {}.buttonStyle(.tappy(.tertiary))
        Button("Destructive") {}.buttonStyle(.tappy(.destructive))
    }
    .padding()
}

#Preview("States") {
    VStack(spacing: Spacing.lg) {
        TappyEmptyState(systemImage: TappyIcon.empty, title: "Nothing here yet",
                        message: "Content will appear here.")
        TappyErrorState(presentation: ErrorPresenter.present(.offline), onRetry: {})
        TappySkeleton().frame(height: 44)
    }
    .padding()
}
