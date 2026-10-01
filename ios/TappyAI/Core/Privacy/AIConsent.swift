import Foundation

/// Consent to send what the person types (and a place / photos when a feature uses them) to the AI provider
/// (App Review 5.1.2(i)). Asked ONCE, before the first AI request, kept on the device, withdrawable in Settings.
///
/// 🚨 Enforced twice: the screens ask first (`AIConsentCoordinator.ensure()`), and the networking layer refuses
/// any AI request while consent is missing (`blocks(path:)`), so a screen that forgets to ask still sends nothing.
final class AIConsentStore: @unchecked Sendable {
    static let shared = AIConsentStore()

    /// The routes that carry the person's content to the AI provider.
    static let aiPaths = ["/api/chat", "/api/translate", "/api/scan", "/api/viet-content"]

    private let defaults: UserDefaults
    private let key = "ai.consent.v1"
    /// Unit tests of OTHER features run without it; the app (and its UI tests) always enforce.
    let enforced: Bool

    init(defaults: UserDefaults = .standard,
         enforced: Bool = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil) {
        self.defaults = defaults
        self.enforced = enforced
    }

    var isGranted: Bool { defaults.bool(forKey: key) }
    func grant() { defaults.set(true, forKey: key) }
    func withdraw() { defaults.removeObject(forKey: key) }

    static func isAIPath(_ path: String) -> Bool {
        let clean = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? path
        return aiPaths.contains { clean == $0 || clean.hasPrefix($0 + "/") }
    }

    /// True when a request to `path` must NOT leave the phone.
    func blocks(path: String) -> Bool { enforced && !isGranted && Self.isAIPath(path) }

    static var blockedError: AppError {
        .validation(message: NSLocalizedString("ai.consent.needed", comment: ""))
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

    func agree() { store.grant(); granted = true; finish(true) }

    /// «Để sau»: nothing is sent, nothing is remembered — the next AI use asks again.
    func later() { finish(false) }

    func withdraw() { store.withdraw(); granted = false }

    /// Settings: switching the setting on shows the same sheet.
    func requestFromSettings() { isPresenting = true }

    private func finish(_ ok: Bool) {
        isPresenting = false
        let pending = waiters
        waiters = []
        pending.forEach { $0.resume(returning: ok) }
    }
}
