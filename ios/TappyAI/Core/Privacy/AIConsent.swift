import Foundation

/// Consent to send what the person types (and a place / photos when a feature uses them) to the AI provider
/// (App Review 5.1.2(i)). Asked ONCE, before the first AI request, kept on the device, withdrawable in Settings.
///
/// 🚨 Enforced twice: the screens ask first (`AIConsentCoordinator.ensure()`), and the networking layer refuses
/// any AI request while consent is missing (`blocks(path:)`), so a screen that forgets to ask still sends nothing.
final class AIConsentStore: @unchecked Sendable {
    static let shared = AIConsentStore()

    /// Posted after every decision (agree or withdraw). The shell listens and sends the decision to the server.
    static let didChange = Notification.Name("ai.consent.didChange")

    /// The disclosure this build asks people to agree to. Bump it whenever the text or the data changes: everyone
    /// who agreed to an older version is asked again (the key below changes with it). Must equal the server's
    /// `AI_DATA_CONSENT_VERSION`. 2 = review photos, group members' own agreement, precise location, search results,
    /// profile name/city/age/gender, OpenAI contract terms.
    static let disclosureVersion = 2

    /// The routes that carry the person's content to the AI provider. `/api/group/{id}/suggest` is matched by pattern
    /// (see `isAIPath`), because its path contains the group id.
    static let aiPaths = ["/api/chat", "/api/translate", "/api/scan", "/api/viet-content", "/api/scam-shield/analyze",
                          "/api/explore/process"]

    private let defaults: UserDefaults
    private let key = "ai.consent.v2"
    private let pendingKey = "ai.consent.v2.pendingSync"
    /// Unit tests of OTHER features run without it; the app (and its UI tests) always enforce.
    let enforced: Bool

    init(defaults: UserDefaults = .standard,
         enforced: Bool = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil) {
        self.defaults = defaults
        self.enforced = enforced
    }

    var isGranted: Bool { defaults.bool(forKey: key) }

    /// Every decision (agree or withdraw) is queued for the server (`AIConsentSync`), so the background messages
    /// stop using the person's data when they withdraw. The queue is cleared only after the server accepts it.
    var isPendingSync: Bool { defaults.bool(forKey: pendingKey) }
    func grant() { defaults.set(true, forKey: key); defaults.set(true, forKey: pendingKey) }
    func withdraw() { defaults.removeObject(forKey: key); defaults.set(true, forKey: pendingKey) }
    func clearPendingSync() { defaults.set(false, forKey: pendingKey) }
    /// The decision the server should hold: granted or withdrawn.
    var currentDecision: Bool { isGranted }

    static func isAIPath(_ path: String) -> Bool {
        let clean = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? path
        if aiPaths.contains(where: { clean == $0 || clean.hasPrefix($0 + "/") }) { return true }
        // POST /api/group/{id}/suggest — sends the members' details to the model.
        let parts = clean.split(separator: "/", omittingEmptySubsequences: true)
        return parts.count == 4 && parts[0] == "api" && parts[1] == "group" && parts[3] == "suggest"
    }

    /// True when a request to `path` must NOT leave the phone.
    func blocks(path: String) -> Bool { enforced && !isGranted && Self.isAIPath(path) }

    static var blockedError: AppError {
        .validation(message: NSLocalizedString("ai.consent.needed", comment: ""))
    }
}

/// Sends the person's latest decision to the server (`POST /api/ai-consent`) so the background jobs honour it.
/// With no decision waiting, it still records that this account uses the app (`granted: null`, a heartbeat that never
/// overwrites a decision), so the server knows the account is an iOS account before the person has answered.
/// Needs a signed-in account (an anonymous visitor has no background messages). A failed send stays pending and is
/// retried on the next flush (sign-in, launch, the next change). A failed heartbeat is retried the same way; nothing
/// is assumed about the person's agreement from it.
enum AIConsentSync {
    static func flush(api: APIClient, signedIn: Bool, store: AIConsentStore = .shared) async {
        guard signedIn else { return }
        let decided = store.isPendingSync
        let granted: Any = decided ? store.currentDecision : NSNull()
        guard let body = try? JSONSerialization.data(withJSONObject: [
            "granted": granted,
            "version": AIConsentStore.disclosureVersion,
        ]) else { return }
        // Not gated by AIConsentStore: recording a refusal or a withdrawal must always be possible.
        let endpoint = Endpoint(path: "/api/ai-consent", method: .post, body: body, requiresAuth: true)
        do {
            _ = try await api.send(endpoint)
            store.clearPendingSync()
        } catch {
            // Stays pending. The server keeps the last decision it accepted until this succeeds.
        }
    }
}

/// Presents the consent sheet and hands the answer back to whoever asked.
@MainActor
final class AIConsentCoordinator: AppObservableObject {
    @AppPublished var isPresenting = false
    @AppPublished private(set) var granted: Bool

    let store: AIConsentStore
    private var waiters: [CheckedContinuation<Bool, Never>] = []

    init(store: AIConsentStore = .shared) {
        self.store = store
        self.granted = store.isGranted
    }

    var isGranted: Bool { store.isGranted }

    /// True once the person has agreed. Otherwise shows the sheet and waits for «Đồng ý» / «Để sau».
    func ensure() async -> Bool {
        if store.isGranted { return true }
        return await withCheckedContinuation { continuation in
            waiters.append(continuation)
            isPresenting = true
        }
    }

    func agree() { store.grant(); granted = true; finish(true); announce() }

    /// «Để sau»: nothing is sent, nothing is remembered — the next AI use asks again.
    func later() { finish(false) }

    func withdraw() { store.withdraw(); granted = false; announce() }

    private func announce() { NotificationCenter.default.post(name: AIConsentStore.didChange, object: nil) }

    /// Settings: switching the setting on shows the same sheet.
    func requestFromSettings() { isPresenting = true }

    private func finish(_ ok: Bool) {
        isPresenting = false
        let pending = waiters
        waiters = []
        pending.forEach { $0.resume(returning: ok) }
    }
}
