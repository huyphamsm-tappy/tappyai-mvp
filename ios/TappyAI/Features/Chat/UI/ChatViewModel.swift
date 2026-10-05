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
    /// R14: the chat's server-side consult-state key. Made once at init (or restored for a chat
    /// reopened from history) and sent on every turn.
    let chatSessionId: String
    private let sessionIdStore = ChatSessionIdStore()
    @AppPublished var hasMemory: Bool = false
    @AppPublished var showOnboarding: Bool = false
    @AppPublished var userPreferences: [String] = []
    @AppPublished var zoomedImageUrl: String? = nil
    @AppPublished var pendingSend: Bool = false

    let tts = TTSManager()
    let voice = VoiceInputManager()

    /// Gives the TTS manager a way to ask the backend for a reply's language without knowing about
    /// networking itself. Set once in `init`; see `TTSManager.resolveLanguage`.
    private func wireReadAloudLanguage() {
        tts.resolveLanguage = { [weak self] text in
            guard let self else { return .failed }
            return await self.service.messageLanguage(text: text)
        }
    }

    // MARK: - Configuration

    let category: String
    let service: ChatService
    private let session: SessionStore
    private let locationCoordinator = LocationCoordinator()
    private var cachedLocation: [String: Double]?

    /// DD-011 — whether the user's location may accompany a request.
    ///
    /// The location was already attached to every turn and shown nowhere, which is a trust problem
    /// twice over: you cannot tell why an answer came out the way it did, and you cannot correct it
    /// without guessing. The chip above the composer states that it is in use and this flag is what
    /// the × clears. Nothing about the permission model changes — an existing input simply became
    /// legible and refusable.
    @Published var locationContextEnabled = true

    /// The location actually sent, or nil once the user has switched it off.
    var activeLocation: [String: Double]? { locationContextEnabled ? cachedLocation : nil }

    /// Whether there is a location to disclose. The chip is shown only when one was actually
    /// captured — announcing context the app does not have would be its own small dishonesty.
    ///
    /// Stored and @Published rather than computed from `cachedLocation`: that property is a
    /// plain var, so a view reading through it would not re-render when the location finally
    /// arrives, and the chip would stay hidden for the rest of the session.
    @Published private(set) var hasLocationContext = false
    private var streamTask: Task<Void, Never>?
    private var thinkTimer: AnyCancellable?
    private var autoSendTask: Task<Void, Never>?
    private let log = AppLogger.chat

    private static let onboardedKey = "tappy_onboarded"
    private static let pendingChatKey = "tappy_pending_chat"

    // MARK: - Init

    /// Publishes a plan for sharing (`POST /api/plans/share`). Nil only in tests that never share.
    let planShare: PlanSharing?

    /// Saves a signed-in user's date of birth (`PATCH /api/profile`) and returns the server's
    /// `ageStatus` / `canCorrectAge`. Nil only where no account flow exists (tests that never hit the gate).
    typealias DateOfBirthSaver = @Sendable (String) async throws -> DateOfBirthUpdateResponse
    /// Reads the account's `ageStatus` / `canCorrectAge` (`GET /api/profile`).
    typealias AgeStatusLoader = @Sendable () async throws -> DateOfBirthUpdateResponse
    private let saveDateOfBirth: DateOfBirthSaver?
    private let loadAgeStatus: AgeStatusLoader?
    private let guestAge: GuestAgeStore

    /// Set while the date of birth is being saved; the form shows its "Saving…" state.
    @AppPublished var ageSubmitting: Bool = false
    /// The form's inline error (invalid date, save failed, correction already used).
    @AppPublished var ageFormError: String? = nil
    /// Blocked account: whether "I entered the wrong date" is offered (server `canCorrectAge`).
    @AppPublished var canCorrectAge: Bool = true
    /// Blocked account: the correction form is open.
    @AppPublished var ageCorrecting: Bool = false

    init(service: ChatService, session: SessionStore, category: String = "general",
         conversationId: String? = nil, savedMessages: [Conversation.ConversationMessage]? = nil,
         planShare: PlanSharing? = nil, saveDateOfBirth: DateOfBirthSaver? = nil,
         loadAgeStatus: AgeStatusLoader? = nil,
         guestAge: GuestAgeStore = GuestAgeStore(),
         consent: AIConsentCoordinator? = nil) {
        self.consent = consent
        self.service = service
        self.session = session
        self.planShare = planShare
        self.saveDateOfBirth = saveDateOfBirth
        self.loadAgeStatus = loadAgeStatus
        self.guestAge = guestAge
        self.category = category
        self.conversationId = conversationId
        self.chatSessionId = ChatSessionId.resolve(historyRowId: conversationId)
        wireReadAloudLanguage()

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

    /// Whether `/api/chat` treats this request as a guest (`!user || user.is_anonymous`): no
    /// session or an anonymous one. `.onboarding` is a real account server-side.
    var isGuest: Bool {
        switch session.state {
        case .authenticated, .onboarding: return false
        case .unknown, .anonymous: return true
        }
    }

    // MARK: - 18+ gate

    /// The guest answered the inline prompt (`18plus` or a birth year): store it — under 18
    /// included, the server decides — and resend the same turn, as Android's `onDeclareAge` does.
    func declareGuestAge(_ value: String) {
        guard !isStreaming else { return }
        guestAge.save(value)
        retry()
    }

    /// The signed-in user entered (or corrected) a date of birth: save it, then resend the turn if
    /// the server now says eligible. Under 18 → the blocked state; nothing is resent.
    func submitDateOfBirth(day: String, month: String, year: String) async {
        guard !ageSubmitting, !isStreaming else { return }
        guard let iso = DateOfBirthInput.iso(day: day, month: month, year: year) else {
            ageFormError = NSLocalizedString("chat.age.error.invalid", comment: "")
            return
        }
        guard let saveDateOfBirth else {
            ageFormError = NSLocalizedString("chat.age.error.failed", comment: "")
            return
        }
        ageSubmitting = true
        defer { ageSubmitting = false }
        let result: Result<DateOfBirthUpdateResponse, Error>
        do { result = .success(try await saveDateOfBirth(iso)) } catch { result = .failure(error) }
        apply(AgeCorrectionOutcome.from(result))
    }

    private func apply(_ outcome: AgeCorrectionOutcome) {
        switch outcome {
        case .resend:
            ageFormError = nil
            ageCorrecting = false
            retry()
        case .blocked(let canCorrect):
            ageFormError = nil
            ageCorrecting = false
            canCorrectAge = canCorrect
            error = .ageIneligible(message: nil)
        case .correctionExhausted:
            ageFormError = nil
            ageCorrecting = false
            canCorrectAge = false
            error = .ageIneligible(message: nil)
        case .formError(let text):
            ageFormError = text
        }
    }

    /// Blocked account taps "I entered the wrong date" (web `AgeCheckView`): open the form. The
    /// server decides whether the correction is allowed (409 `age_correction_exhausted`).
    func startAgeCorrection() {
        guard !isGuest, canCorrectAge else { return }
        ageFormError = nil
        ageCorrecting = true
    }

    func cancelAgeCorrection() {
        ageFormError = nil
        ageCorrecting = false
    }

    /// The server refused an account as under 18: ask it whether a correction is still allowed,
    /// so the button is not offered to someone who has used theirs (web reads `GET /api/profile`).
    private func refreshAgeCorrection() {
        guard !isGuest, let loadAgeStatus else { return }
        Task { [weak self] in
            guard let status = try? await loadAgeStatus() else { return }
            self?.canCorrectAge = status.mayCorrect
        }
    }

    static func dateOfBirthErrorText(_ error: Error) -> String {
        switch error as? AppError {
        case .validation(let message)?:
            return message   // the server's localized `age.invalidDate`
        case .network(_, let code?)? where code == "age_correction_exhausted":
            return NSLocalizedString("chat.age.error.correctionExhausted", comment: "")
        default:
            return NSLocalizedString("chat.age.error.failed", comment: "")
        }
    }

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
            self.error = Self.mapError(error, isGuest: isGuest)
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
            hasLocationContext = true
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

    /// Under 18 (`age_ineligible`): the chat input is locked and nothing is sent — the server would
    /// only refuse again. (Correction of a wrong date is the account's own flow.)
    var isAgeBlocked: Bool { error?.locksInput ?? false }

    /// The user is editing the date again: an error about the previous attempt no longer applies.
    func clearAgeFormError() {
        if ageFormError != nil { ageFormError = nil }
    }

    func send() {
        cancelAutoSend()
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming, !isAgeBlocked else { return }
        inputText = ""
        error = nil

        let userMsg = ChatMessage(role: .user, content: text, status: .complete)
        messages.append(userMsg)

        startStreaming()
    }

    func sendQuickPrompt(_ text: String) {
        guard !isStreaming, !isAgeBlocked else { return }
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
        guard !isStreaming, !isAgeBlocked else { return }
        if let last = messages.last, last.isAssistant {
            messages.removeLast()
        }
        error = nil
        startStreaming()
    }

    // MARK: - Resume after login

    /// Whether the held message should be resent once the person has signed in: the turn stopped on a
    /// «sign in» error and the last message is still the user's.
    static func shouldResumeAfterLogin(error: ChatError?, lastIsUser: Bool, isStreaming: Bool, signedIn: Bool) -> Bool {
        guard signedIn, lastIsUser, !isStreaming else { return false }
        return error == .authRequired || error == .anonLimitReached
    }

    func resumeAfterLogin() {
        guard Self.shouldResumeAfterLogin(error: error, lastIsUser: messages.last?.isUser == true,
                                          isStreaming: isStreaming, signedIn: isAuthenticated) else { return }
        retry()
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

    /// The artifact the TappyAI share sheet is showing, or nil. Set by `share(messageIndex:)`.
    @AppPublished var shareArtifact: ShareArtifact? = nil

    /// Share one assistant turn as the branded brochure (web parity: one canonical artifact
    /// + the TappyAI share sheet). Sources in priority order: the structured recommendation
    /// (`8:` annotation) → the plan → the prose. The system sheet stays reachable as "More apps".
    func share(messageIndex: Int, lang: String) {
        guard messages.indices.contains(messageIndex) else { return }
        let msg = messages[messageIndex]
        let subject = messages[..<messageIndex].last(where: { $0.isUser })?.content
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .prefix(80).description
        let title = (subject?.isEmpty == false) ? subject! : "TappyAI"
        let parsed = ContentParser.parse(msg.content)
        if let view = msg.placesView, !view.items.isEmpty {
            shareArtifact = ShareArtifactBuilder.buildPlacesArtifact(view, title: title, lang: lang)
        } else if let plan = parsed.plan, !plan.days.isEmpty {
            // The block rides along: the share sheet publishes it and delivers the plan's page.
            shareArtifact = ShareArtifactBuilder.buildPlanArtifact(plan, title: title, lang: lang, planJSON: parsed.planJSON)
        } else {
            shareArtifact = ShareArtifactBuilder.buildProseArtifact(subject: title, prose: parsed.text)
        }
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
        // Localized because this is sent AS THE USER'S MESSAGE, not shown as UI. An English user
        // tapping "Nearby" was silently sending Vietnamese on their behalf — it appears in their
        // own transcript in a language they did not write, and it steers the model's reply.
        sendQuickPrompt(NSLocalizedString("chat.quickPrompt.nearby", comment: ""))
    }

    // MARK: - Streaming

    /// «Share data with AI» (App Review 5.1.2(i)): asked once, before the first message goes out.
    private let consent: AIConsentCoordinator?
    private var awaitingConsent = false

    /// Whether this turn must wait for the person's answer. When it must, the sheet is shown and the turn
    /// resumes on «Đồng ý»; on «Để sau» NOTHING is sent and the typed text goes back into the box.
    private func holdForConsent() -> Bool {
        guard let consent, !consent.isGranted else { return false }
        guard !awaitingConsent else { return true }
        awaitingConsent = true
        Task { @MainActor [weak self] in
            let agreed = await consent.ensure()
            guard let self else { return }
            self.awaitingConsent = false
            if agreed {
                self.startStreaming()
            } else if let last = self.messages.last, last.isUser {
                self.inputText = last.content
                self.messages.removeLast()
            }
        }
        return true
    }

    private func startStreaming() {
        if holdForConsent() { return }
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
                userLocation: self.activeLocation,
                guestAgeDeclaration: self.isGuest ? self.guestAge.declaration : nil,
                chatSessionId: self.chatSessionId
            )

            var streamReportedError = false
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

                    case .places(let view):
                        // Held on the message, never appended to `content` — so it cannot leak into
                        // the reply, into TTS or into what gets persisted.
                        self.messages[assistantIndex].livePlaces = view
                        // Share parity: the same decision, projected for the share sheet.
                        self.messages[assistantIndex].placesView = SharePlacesView(from: view)

                    case .stepEnd:
                        self.activeTool = nil

                    case .done:
                        break

                    // The AI SDK data stream reports a failed turn as an `3:` error part on a 200 response. It was ignored, so a failed
                    // turn finished as an empty "complete" reply and the person saw no answer and no error.
                    case .unknown(let prefix, _) where prefix == "3":
                        streamReportedError = true

                    // Non-places annotations carry nothing the chat UI renders yet.
                    case .messageStart, .annotation, .unknown:
                        break
                    }
                }

                // A stream that ends with nothing to show is a failure, never a reply: say so and offer a retry.
                if !Task.isCancelled, Self.streamProducedNothing(content: self.messages[assistantIndex].content,
                                              hasPlaces: self.messages[assistantIndex].livePlaces != nil) {
                    throw AppError.streaming(reason: streamReportedError ? "server reported an error" : "empty reply")
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

                self.error = Self.mapError(error, isGuest: self.isGuest)
                if case .ageIneligible? = self.error { self.refreshAgeCorrection() }
                self.log.error("stream error: \(error)")
            }
        }
    }

    /// True when a finished stream left nothing the person can read: no text and no place card.
    static func streamProducedNothing(content: String, hasPlaces: Bool) -> Bool {
        !hasPlaces && content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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
            // Reopening this chat from history later keeps the same chatSessionId (R14).
            if let id = conversationId { sessionIdStore.put(id, chatSessionId) }
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

    /// [isGuest] matters for one code: `age_declaration_required` is the GUEST answer. A signed-in
    /// user only receives it when the server's identity lookup failed and it fell back to the guest
    /// check (`route.ts`, "UNMETERED MUST NEVER MEAN UNGATED"). Showing the guest birth-year form
    /// there loops — the account's request never carries the guest header — so it is a temporary
    /// failure: retriable, nothing to fill in.
    static func mapError(_ error: Error, isGuest: Bool = true) -> ChatError {
        guard let appError = error as? AppError else {
            return .generic
        }
        switch appError {
        case .authentication(let reason):
            switch reason {
            case .anonLimitReached: return .anonLimitReached
            case .freeLimitReached: return .freeLimitReached
            case .ageGate(let code, let message):
                switch AgeGateCode(rawValue: code) {
                case .declarationRequired:
                    return isGuest ? .ageDeclarationRequired(message: message) : .generic
                case .verificationRequired: return .ageVerificationRequired(message: message)
                case .ineligible: return .ageIneligible(message: message)
                case nil: return .authRequired
                }
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
    /// 18+ gate — guest must state their age (inline year / "I am 18 or older").
    case ageDeclarationRequired(message: String?)
    /// 18+ gate — account has no date of birth; collect it and save via `PATCH /api/profile`.
    case ageVerificationRequired(message: String?)
    /// 18+ gate — under 18. Blocked; no way around it from the client.
    case ageIneligible(message: String?)

    /// Under 18: nothing may be sent, so the chat input is locked. Every other state leaves the
    /// input usable (the age forms included — the user may still type while answering them).
    var locksInput: Bool {
        if case .ageIneligible = self { return true }
        return false
    }

    var isRetriable: Bool {
        switch self {
        case .generic, .offline: return true
        case .authRequired, .anonLimitReached, .freeLimitReached,
             .ageDeclarationRequired, .ageVerificationRequired, .ageIneligible: return false
        }
    }
}
