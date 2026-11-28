import SwiftUI

/// Whether the one-line «Dùng gói Pro…» note is drawn under a finished answer (web `ProUpsellNote.tsx`, 17/11/2026; owner asked for it on
/// iOS 28/11). Web rule: only for a person on the Free plan, and only while the plans are on sale. On iOS "the plans are on sale" is the
/// build's purchase switch (`ProductFlags.iapPurchaseUI`). Until the plan has been read nothing is drawn, and any failure reads as "not
/// Free": the note is an offer, never shown on a guess.
///
/// A signed-out visitor does not see it yet: web decides «Free» by `plan == 'free'` and the server reports a guest as `guest`, so the web
/// note is not drawn for guests either. Whether guests should see it is the owner's call.
@MainActor
final class ProUpsellState: ObservableObject {
    static let shared = ProUpsellState()
    @Published private(set) var showsNote = false

    /// Reads the plan once per sign-in change (the shell calls this) and after the subscription screen has read it.
    func refresh(api: APIClient, signedIn: Bool) async {
        guard ProductFlags.iapPurchaseUI, signedIn else { showsNote = false; return }
        do {
            let endpoint = Endpoint(path: "/api/subscription", method: .get, requiresAuth: true)
            let data = try await api.send(endpoint)
            let status = try ResponseDecoder.json.decode(SubscriptionStatusResponse.self, from: data)
            showsNote = !status.isPro
        } catch {
            showsNote = false
        }
    }

    /// The subscription screen just read the account's plan: keep the note in step (a purchase made there removes it).
    func apply(isPro: Bool, signedIn: Bool) {
        showsNote = ProductFlags.iapPurchaseUI && signedIn && !isPro
    }
}

/// «Dùng gói Pro để có câu trả lời thông minh hơn và dữ liệu chính xác hơn. · Xem gói Pro». The link opens the plans screen inside the app
/// (a plain in-app navigation, not a link to a purchase outside the App Store).
struct ProUpsellNote: View {
    @ObservedObject private var state = ProUpsellState.shared
    @AppEnvironmentState private var router: AppRouter

    var body: some View {
        if state.showsNote {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: "sparkles").font(.system(size: 12)).foregroundStyle(Color.orange.opacity(0.85))
                    .accessibilityHidden(true)
                (Text("chat.proNote") + Text(" ") + Text("chat.proNote.cta").foregroundColor(TappyColor.primary).fontWeight(.medium))
                    .font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture {
                router.push(ProfileDestination.subscription, on: .profile)
                router.switchTo(.profile)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("chat-pro-note")
        }
    }
}
