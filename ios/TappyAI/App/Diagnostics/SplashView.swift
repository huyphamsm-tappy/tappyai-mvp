import SwiftUI

/// Shown only during the brief `.unknown` launch window before the Keychain session is read.
struct SplashView: View {
    var body: some View {
        ZStack {
            TappyColor.background.ignoresSafeArea()
            VStack(spacing: Spacing.md) {
                Image(systemName: "sparkles")
                    .font(.system(size: 48))
                    .foregroundStyle(TappyColor.primary)
                TappyLoadingIndicator()
            }
        }
    }
}
