import XCTest
@testable import TappyAI

/// The iOS side of the `/api/chat` 18+ gate (contract in `AgeGate.swift`).
@MainActor
final class AgeGateTests: XCTestCase {

    // MARK: - Guest declaration

    func testGuestDeclarationWireNames() {
        XCTAssertEqual(GuestAgeDeclaration.header, "x-tappy-age-declared")
        XCTAssertEqual(GuestAgeDeclaration.adult, "18plus")
        XCTAssertEqual(GuestAgeDeclaration.storageKey, "guest_age_declaration")
    }

    func testBirthYearAcceptsOnlyAFourDigitYearFrom1900ToNow() {
        XCTAssertEqual(GuestAgeDeclaration.value(forBirthYear: "1990", currentYear: 2026), "1990")
        XCTAssertEqual(GuestAgeDeclaration.value(forBirthYear: " 2000 ", currentYear: 2026), "2000")
        XCTAssertEqual(GuestAgeDeclaration.value(forBirthYear: "1900", currentYear: 2026), "1900")
        XCTAssertEqual(GuestAgeDeclaration.value(forBirthYear: "2026", currentYear: 2026), "2026",
                       "an under-18 year is still sent as stated — the server refuses it, not the client")
        for bad in ["1899", "2027", "199", "19900", "abcd", "", "２０００", "-199"] {
            XCTAssertNil(GuestAgeDeclaration.value(forBirthYear: bad, currentYear: 2026), bad)
        }
    }

    func testGuestAgeStoreRoundTrips() throws {
        let suite = "AgeGateTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = GuestAgeStore(defaults: defaults)
        XCTAssertNil(store.declaration)
        store.save("")
        XCTAssertNil(store.declaration, "an empty value is no declaration")
        store.save("18plus")
        XCTAssertEqual(GuestAgeStore(defaults: defaults).declaration, "18plus")
    }

    func testChatRequestCarriesTheDeclarationOnlyWhenGiven() async throws {
        let streaming = RecordingStreamingClient()
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        let messages = [MessagePayload(role: "user", content: "Ăn gì tối nay?")]

        _ = service.chatWithContext(messages: messages, userPreferences: nil, responseStyle: nil, guestAgeDeclaration: "1995")
        _ = service.chatWithContext(messages: messages, userPreferences: nil, responseStyle: nil, guestAgeDeclaration: nil)

        XCTAssertEqual(streaming.endpoints.count, 2)
        XCTAssertEqual(streaming.endpoints[0].path, "/api/chat")
        XCTAssertEqual(streaming.endpoints[0].headers["x-tappy-age-declared"], "1995")
        XCTAssertNil(streaming.endpoints[1].headers["x-tappy-age-declared"], "accounts send no declaration")
    }

    // MARK: - Date of birth

    private let today: Date = {
        AgeGateCalendar.utc.date(from: DateComponents(year: 2026, month: 9, day: 27))!
    }()

    func testDateOfBirthIsARealPastCalendarDate() {
        XCTAssertEqual(DateOfBirthInput.iso(day: "5", month: "7", year: "1990", today: today), "1990-07-05")
        XCTAssertEqual(DateOfBirthInput.iso(day: "29", month: "02", year: "2024", today: today), "2024-02-29")
        XCTAssertEqual(DateOfBirthInput.iso(day: "27", month: "9", year: "2026", today: today), "2026-09-27")
        let bad: [(String, String, String)] = [
            ("30", "2", "2000"), ("29", "2", "2023"), ("1", "13", "2000"), ("0", "1", "2000"),
            ("1", "1", "1899"), ("28", "9", "2026"), ("", "1", "2000"), ("1", "1", "90"),
            ("123", "1", "2000"), ("1a", "1", "2000"), ("1", "1", "20000"),
        ]
        for (d, m, y) in bad {
            XCTAssertNil(DateOfBirthInput.iso(day: d, month: m, year: y, today: today), "\(d)/\(m)/\(y)")
        }
    }

    func testSavingTheDateOfBirthIsAPatchToProfile() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true,"ageStatus":"eligible","age":31,"ageBand":"25-34","canCorrectAge":true}"#.utf8)
        let response = try await ProfileService(api: api).updateDateOfBirth("1995-03-01")

        XCTAssertEqual(response.status, .eligible)
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/profile")
        XCTAssertEqual(sent.method, .patch)
        XCTAssertTrue(sent.requiresAuth)
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(sent.body)) as? [String: String])
        XCTAssertEqual(body, ["dateOfBirth": "1995-03-01"])
    }

    func testAgeStatusDecoding() throws {
        func status(_ json: String) throws -> AgeStatus {
            try JSONDecoder().decode(DateOfBirthUpdateResponse.self, from: Data(json.utf8)).status
        }
        XCTAssertEqual(try status(#"{"ageStatus":"eligible"}"#), .eligible)
        XCTAssertEqual(try status(#"{"ageStatus":"ineligible"}"#), .ineligible)
        XCTAssertEqual(try status(#"{"ageStatus":"unknown"}"#), .unknown)
        XCTAssertEqual(try status(#"{"ok":true}"#), .unknown)
    }

    // MARK: - Server refusals → chat states

    private func http403(_ json: String) -> AppError {
        URLSessionAPIClient.mapHTTP(status: 403, data: Data(json.utf8))
    }

    func testAge403sAreRecognisedWithTheServerSentence() {
        XCTAssertEqual(
            http403(#"{"error":"age_declaration_required","message":"Vui lòng xác nhận bạn đủ 18 tuổi để dùng thử Tappy.","upgradeUrl":"/age-check"}"#),
            .authentication(reason: .ageGate(code: "age_declaration_required",
                                             message: "Vui lòng xác nhận bạn đủ 18 tuổi để dùng thử Tappy.")))
        XCTAssertEqual(
            http403(#"{"error":"age_verification_required","message":"Please tell us your date of birth to continue."}"#),
            .authentication(reason: .ageGate(code: "age_verification_required",
                                             message: "Please tell us your date of birth to continue.")))
        XCTAssertEqual(http403(#"{"error":"age_ineligible"}"#),
                       .authentication(reason: .ageGate(code: "age_ineligible", message: nil)))
        // Anything else stays what it was.
        XCTAssertEqual(http403(#"{"error":"forbidden"}"#), .authentication(reason: .forbidden))
        XCTAssertEqual(http403("not json"), .authentication(reason: .forbidden))
        XCTAssertEqual(URLSessionAPIClient.mapHTTP(status: 401, data: Data(#"{"error":"anon_limit_reached"}"#.utf8)),
                       .authentication(reason: .anonLimitReached))
    }

    func testChatMapsEachGateCodeToItsOwnState() {
        func chat(_ code: String, _ message: String? = "m") -> ChatError {
            ChatViewModel.mapError(AppError.authentication(reason: .ageGate(code: code, message: message)))
        }
        XCTAssertEqual(chat("age_declaration_required"), .ageDeclarationRequired(message: "m"))
        XCTAssertEqual(chat("age_verification_required"), .ageVerificationRequired(message: "m"))
        XCTAssertEqual(chat("age_ineligible", nil), .ageIneligible(message: nil))
        XCTAssertEqual(ChatViewModel.mapError(AppError.authentication(reason: .forbidden)), .authRequired)
        for state in [chat("age_declaration_required"), chat("age_verification_required"), chat("age_ineligible")] {
            XCTAssertFalse(state.isRetriable, "a plain retry cannot get past the gate")
        }
    }

    func testOnlyTheUnder18BlockLocksTheChatInput() {
        XCTAssertTrue(ChatError.ageIneligible(message: nil).locksInput)
        for other: ChatError in [.generic, .offline, .authRequired, .anonLimitReached, .freeLimitReached,
                                 .ageDeclarationRequired(message: nil), .ageVerificationRequired(message: nil)] {
            XCTAssertFalse(other.locksInput, "\(other)")
        }
    }

    func testSignedInUserNeverGetsTheGuestYearForm() {
        // A signed-in user only sees age_declaration_required when the server's identity lookup
        // failed; the guest form would loop (the account never sends the guest header).
        let refusal = AppError.authentication(reason: .ageGate(code: "age_declaration_required", message: "m"))
        let signedIn = ChatViewModel.mapError(refusal, isGuest: false)
        XCTAssertEqual(signedIn, .generic)
        XCTAssertTrue(signedIn.isRetriable, "a temporary failure: offer a retry")
        XCTAssertEqual(ChatViewModel.mapError(refusal, isGuest: true), .ageDeclarationRequired(message: "m"))
        // The account codes are unaffected.
        let noDob = AppError.authentication(reason: .ageGate(code: "age_verification_required", message: nil))
        XCTAssertEqual(ChatViewModel.mapError(noDob, isGuest: false), .ageVerificationRequired(message: nil))
    }

    func testDateOfBirthSaveErrorsShowTheRightSentence() {
        XCTAssertEqual(ChatViewModel.dateOfBirthErrorText(AppError.validation(message: "Ngày sinh không hợp lệ.")),
                       "Ngày sinh không hợp lệ.")
        let exhausted = ChatViewModel.dateOfBirthErrorText(AppError.network(status: 409, code: "age_correction_exhausted"))
        XCTAssertEqual(exhausted, NSLocalizedString("chat.age.error.correctionExhausted", comment: ""))
        XCTAssertNotEqual(exhausted, "chat.age.error.correctionExhausted", "the string is in the catalog")
        XCTAssertEqual(ChatViewModel.dateOfBirthErrorText(AppError.offline),
                       NSLocalizedString("chat.age.error.failed", comment: ""))
    }
}

/// Records the endpoint of every stream it is asked for; the stream itself ends immediately.
private final class RecordingStreamingClient: StreamingClient, @unchecked Sendable {
    // @unchecked: test double, only touched from the test's own (main-actor) task.
    private(set) var endpoints: [Endpoint] = []
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        endpoints.append(endpoint)
        return AsyncThrowingStream { $0.finish() }
    }
}
