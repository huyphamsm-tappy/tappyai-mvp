import SwiftUI

/// Neutral placeholder content for a shell tab. This is navigation scaffolding, NOT a product
/// feature — each real feature root (Home, Chat, Explore, Deals, Profile) replaces this in later
/// phases by attaching to the shell. No product behavior is implemented here.
struct PlaceholderTabView: View {
    let tab: AppTab

    var body: some View {
        ZStack {
            TappyColor.background.ignoresSafeArea()
            TappyEmptyState(
                systemImage: tab.systemImage,
                title: LocalizedStringKey(tab.titleKey),
                // C36 — was a plain String while `title` above used LocalizedStringKey, so a
                // Vietnamese user read a Vietnamese title over an English message.
                message: LocalizedStringKey("placeholder.comingSoon")
            )
        }
    }
}
