import Foundation
import Combine

@MainActor
final class ChatViewModel: AppObservableObject {

    // MARK: - Published state

    @AppPublished var messages: [ChatMessage] = []
    @AppPublished var inputText: String = ""
    @AppPublished var isStreaming: Bool = false
    @AppPublished var isLoadingConversation: Bool = false
    @AppPublished var error: ChatError? = nil
    @AppPublished var thinkHintIndex: Int = 0
    @AppPublished var activeTool: String? = nil
    @AppPublished var conversationId: String? = nil
    @AppPublished var hasMemory: Bool = false
    @AppPublished var showOnboarding: Bool = false
    @AppPublished var userPreferences: [String] = []
    @AppPublished var zoomedImageUrl: String? = nil
    @AppPublished var pendingSend: Bool = false

    let tts = TTSManager()
    let voice = VoiceInputManager()

    // MARK: - Configuration

    let category: String
    let service: ChatService
    private let session: SessionStore
    private let locationCoordinator = LocationCoordinator()
    private var cachedLocation: [String: Double]?
    private var streamTask: Task<Void, Never>?
    private var thinkTimer: AnyCancellable?
    private var autoSendTask: Task<Void, Never>?
    private let log = AppLogger.chat

    private static let onboardedKey = "tappy_onboarded"
    private static let pendingChatKey = "tappy_pending_chat"

    // MARK: - Init

    init(service: ChatService, session: SessionStore, category: String = "general",
         conversationId: String? = nil, savedMessages: [Conversation.ConversationMessage]? = nil) {
        self.service = service
        self.session = session
        self.category = category
        self.conversationId = conversationId

        if let saved = savedMessages {
            self.messages = saved.enumerated().map { idx, m in
                ChatMessage(
                    id: String(idx),
                    role: MessageRole(rawValue: m.role) ?? .user,
                    content: m.content
                )
            }
        }

        voice.onTranscript = { [weak self] text in
            self?.inputText = text
        }
        voice.onFinished = { [weak self] text in
            guard let self, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            self.inputText = text
            self.pendingSend = true
            self.autoSendTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(2))
                guard let self, !Task.isCancelled else { return }
                self.pendingSend = false
                self.autoSendTask = nil
                guard !self.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      !self.isStreaming else { return }
                self.send()
            }
        }
    }

    deinit {
        streamTask?.cancel()
    }

    var isAuthenticated: Bool { session.state.isAuthenticated }

    // MARK: - Load existing conversation

    func loadConversation() async {
        guard let id = conversationId, messages.isEmpty else { return }
        isLoadingConversation = true
        do {
            let conversation = try await service.loadConversation(id: id)
            messages = conversation.messages.enumerated().map { idx, m in
                ChatMessage(
                    id: String(idx),
                    role: MessageRole(rawValue: m.role) ?? .user,
                    content: m.content
                )
            }
        } catch {
            self.error = Self.mapError(error)
            log.error("load conversation failed: \(error)")
        }
        isLoadingConversation = false
    }

    // MARK: - Initial data fetch (memory + preferences + onboarding)

    func fetchInitialData() async {
        async let memoryCheck: Bool = service.checkMemory()
        async let prefsCheck: [String]? = service.fetchPreferences()

        hasMemory = await memoryCheck

        if let prefs = await prefsCheck {
            userPreferences = prefs
            if !UserDefaults.standard.bool(forKey: Self.onboardedKey) {
                showOnboarding = true
            }
        }

        if let loc = await locationCoordinator.requestOnce() {
            cachedLocation = ["lat": loc.coordinate.latitude, "lng": loc.coordinate.longitude]
        }
    }

    func completeOnboarding(prefs: [String]) {
        showOnboarding = false
        UserDefaults.standard.set(true, forKey: Self.onboardedKey)
        if !prefs.isEmpty {
            userPreferences = prefs
            Task { await service.savePreferences(prefs) }
        }
    }

    // MARK: - Send message

    func send() {
        cancelAutoSend()
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming else { return }
        inputText = ""
        error = nil

        let userMsg = ChatMessage(role: .user, content: text, status: .complete)
        messages.append(userMsg)

        startStreaming()
    }

    func sendQuickPrompt(_ text: String) {
        guard !isStreaming else { return }
        inputText = ""
        error = nil

        let userMsg = ChatMessage(role: .user, content: text, status: .complete)
        messages.append(userMsg)

        startStreaming()
    }

    // MARK: - Stop / Cancel

    func stop() {
        streamTask?.cancel()
        streamTask = nil
        stopThinkTimer()
        isStreaming = false
        activeTool = nil

        if let last = messages.last, last.isAssistant, last.status == .streaming {
            messages[messages.count - 1].status = .complete
        }
    }

    // MARK: - Regenerate

    func regenerate() {
        guard !isStreaming else { return }
        if let last = messages.last, last.isAssistant {
            messages.removeLast()
        }
        error = nil
        startStreaming()
    }

    // MARK: - Retry after error

    func retry() {
        guard !isStreaming else { return }
        error = nil
        startStreaming()
    }

    // MARK: - Delete message

    func deleteMessage(id: String) {
        messages.removeAll { $0.id == id }
    }

    // MARK: - Share

    func shareText(_ text: String) {
        let stripped = TTSManager.stripMarkdown(text)
        let av = UIActivityViewController(activityItems: [stripped], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first?.rootViewController else { return }
        if let popover = av.popoverPresentationController {
            popover.sourceView = root.view
            popover.sourceRect = CGRect(x: root.view.bounds.midX, y: root.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        root.present(av, animated: true)
    }

    // MARK: - Feedback (like/dislike/report)

    func likeFeedback(messageIndex: Int, isActive: Bool) {
        guard let cid = conversationId else { return }
        if isActive {
            Task { await service.saveFeedback(conversationId: cid, messageIndex: messageIndex, type: "like") }
        } else {
            Task { await service.deleteFeedback(conversationId: cid, messageIndex: messageIndex, type: "like") }
        }
    }

    func dislikeFeedback(messageIndex: Int, isActive: Bool) {
        guard let cid = conversationId else { return }
        if isActive {
            Task { await service.saveFeedback(conversationId: cid, messageIndex: messageIndex, type: "dislike") }
        } else {
            Task { await service.deleteFeedback(conversationId: cid, messageIndex: messageIndex, type: "dislike") }
        }
    }

    func reportFeedback(messageIndex: Int) {
        guard let cid = conversationId else { return }
        Task { await service.saveFeedback(conversationId: cid, messageIndex: messageIndex, type: "report") }
    }

    // MARK: - Save place

    func savePlaceManual(name: String) {
        let placeId = "manual_\(Int(Date().timeIntervalSince1970 * 1000))"
        Task { await service.savePlace(placeId: placeId, placeName: name, placeAddress: "", placeType: "saved") }
    }

    func savePlaceFavorite(placeId: String, name: String, address: String, type: String) {
        Task { await service.savePlace(placeId: placeId, placeName: name, placeAddress: address, placeType: type) }
    }

    // MARK: - Stash / restore pending chat (anonymous continuity across login)

    func stashPendingChat() {
        guard !messages.isEmpty else { return }
        let payload = messages.map { ["role": $0.role.rawValue, "content": $0.content] }
        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            UserDefaults.standard.set(data, forKey: Self.pendingChatKey)
        }
    }

    func restorePendingChat() {
        guard conversationId == nil, messages.isEmpty,
              let data = UserDefaults.standard.data(forKey: Self.pendingChatKey),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] else { return }
        UserDefaults.standard.removeObject(forKey: Self.pendingChatKey)
        messages = arr.enumerated().compactMap { idx, dict in
            guard let role = dict["role"], let content = dict["content"] else { return nil }
            return ChatMessage(id: String(idx), role: MessageRole(rawValue: role) ?? .user, content: content)
        }
    }

    // MARK: - Emoji insert

    func insertEmoji(_ emoji: String) {
        inputText += emoji
    }

    // MARK: - Cancel pending auto-send (voice grace window)

    func cancelAutoSend() {
        autoSendTask?.cancel()
        autoSendTask = nil
        pendingSend = false
    }

    // MARK: - Voice

    func toggleVoice() {
        if voice.isListening {
            voice.stopListening()
        } else {
            voice.startListening(existingText: inputText)
        }
    }

    // MARK: - Nearby search (action chip)

    func nearbySearch() {
        sendQuickPrompt("Gợi ý quán ăn và địa điểm vui chơi gần mình nhé")
    }

    // MARK: - Streaming

    private func startStreaming() {
        // Trim history from the front to stay under the backend's 24 000-char input cap.
        var payloads = messages.map { MessagePayload(role: $0.role.rawValue, content: $0.content) }
        let maxChars = 20_000
        var totalChars = payloads.reduce(0) { $0 + $1.content.count }
        while totalChars > maxChars && payloads.count > 1 {
            totalChars -= payloads[0].content.count
            payloads.removeFirst()
        }

        let assistantMsg = ChatMessage(role: .assistant, content: "", status: .streaming)
        messages.append(assistantMsg)
        let assistantIndex = messages.count - 1

        isStreaming = true
        activeTool = nil
        startThinkTimer()

        streamTask = Task { [weak self] in
            guard let self else { return }
            let stream = self.service.chatWithContext(
                messages: payloads,
                userPreferences: self.userPreferences.isEmpty ? nil : self.userPreferences,
                responseStyle: nil,
                userLocation: self.cachedLocation
            )

            do {
                for try await frame in stream {
                    guard !Task.isCancelled else { break }
                    switch frame {
                    case .text(let delta):
                        self.messages[assistantIndex].content += delta
                        self.activeTool = nil

                    case .toolCall(let data):
                        if let call = Self.parseToolCall(data) {
                            self.activeTool = call.toolName
                            let invocation = ToolInvocation(
                                id: call.id, toolName: call.toolName, state: .calling
                            )
                            self.messages[assistantIndex].toolInvocations.append(invocation)
                        }

                    case .toolResult(let data):
                        if let result = Self.parseToolResult(data) {
                            if let idx = self.messages[assistantIndex].toolInvocations
                                .firstIndex(where: { $0.id == result.id }) {
                                self.messages[assistantIndex].toolInvocations[idx].state = .result(result.data)
                            }
                        }
                        self.activeTool = nil

                    case .stepEnd:
                        self.activeTool = nil

                    case .done:
                        break

                    case .messageStart, .unknown:
                        break
                    }
                }

                self.messages[assistantIndex].status = .complete
                self.isStreaming = false
                self.activeTool = nil
                self.stopThinkTimer()
                self.hasMemory = true

                await self.persistConversation()

            } catch {
                self.isStreaming = false
                self.activeTool = nil
                self.stopThinkTimer()

                if error is CancellationError || (error as? AppError) == .cancellation {
                    self.messages[assistantIndex].status = .complete
                    return
                }

                if self.messages[assistantIndex].content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    self.messages.remove(at: assistantIndex)
                } else {
                    self.messages[assistantIndex].status = .failed
                }

                self.error = Self.mapError(error)
                self.log.error("stream error: \(error)")
            }
        }
    }

    // MARK: - Think timer

    private func startThinkTimer() {
        thinkHintIndex = 0
        thinkTimer = Timer.publish(every: 1.8, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.thinkHintIndex += 1
            }
    }

    private func stopThinkTimer() {
        thinkTimer?.cancel()
        thinkTimer = nil
        thinkHintIndex = 0
    }

    // MARK: - Conversation persistence

    private func persistConversation() async {
        guard session.state.isAuthenticated else { return }
        let payloads = messages.map { MessagePayload(role: $0.role.rawValue, content: $0.content) }
        let title = messages.first(where: { $0.isUser })?.content.prefix(50).description ?? "Chat"

        do {
            if let id = conversationId {
                try await service.updateConversation(id: id, title: title, messages: payloads)
            } else {
                let saved = try await service.saveConversation(
                    title: title, category: category, messages: payloads
                )
                conversationId = saved.id
            }
        } catch {
            log.error("persist failed: \(error)")
        }
    }

    // MARK: - Parsing helpers

    private struct ToolCallParsed { let id: String; let toolName: String }
    private struct ToolResultParsed { let id: String; let data: Data }

    private static func parseToolCall(_ data: Data) -> ToolCallParsed? {
        guard let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let first = arr.first,
              let id = first["toolCallId"] as? String,
              let name = first["toolName"] as? String else { return nil }
        return ToolCallParsed(id: id, toolName: name)
    }

    private static func parseToolResult(_ data: Data) -> ToolResultParsed? {
        guard let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let first = arr.first,
              let id = first["toolCallId"] as? String else { return nil }
        let resultData = (try? JSONSerialization.data(withJSONObject: first["result"] ?? [:])) ?? Data()
        return ToolResultParsed(id: id, data: resultData)
    }

    // MARK: - Error mapping

    private static func mapError(_ error: Error) -> ChatError {
        guard let appError = error as? AppError else {
            return .generic
        }
        switch appError {
        case .authentication(let reason):
            switch reason {
            case .anonLimitReached: return .anonLimitReached
            case .freeLimitReached: return .freeLimitReached
            case .unauthenticated: return .authRequired
            default: return .authRequired
            }
        case .offline: return .offline
        case .streaming: return .generic
        default: return .generic
        }
    }
}

// MARK: - Chat error enum

enum ChatError: Equatable, Sendable {
    case generic
    case offline
    case authRequired
    case anonLimitReached
    case freeLimitReached

    var isRetriable: Bool {
        switch self {
        case .generic, .offline: return true
        case .authRequired, .anonLimitReached, .freeLimitReached: return false
        }
    }
}
