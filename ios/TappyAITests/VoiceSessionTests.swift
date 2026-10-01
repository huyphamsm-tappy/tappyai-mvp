import XCTest
@testable import TappyAI

/// Every way out of a voice session releases the microphone the same way (`VoiceSession.teardown`), and the dictated
/// text is handed on at most once.
final class VoiceSessionTests: XCTestCase {

    /// A session that is fully up: category set + active, tap installed, engine running, recogniser running.
    private func running() -> VoiceSession {
        var s = VoiceSession()
        s.activatedSession(); s.installedTap(); s.startedEngine(); s.startedRecognition()
        return s
    }

    private let release: [VoiceSession.Action] = [.endAudio, .stopEngine, .removeTap, .cancelTask, .deactivateSession]

    func testSendReleasesEverythingAndHandsTheTextOnce() {
        var s = running()
        XCTAssertEqual(s.teardown(deliverFinal: true, transcript: "xin chào"), release + [.deliverFinal("xin chào")])
        XCTAssertFalse(s.isHolding)
        // The recogniser reports its own end after the cancel: nothing more happens, the text is not handed on twice.
        XCTAssertEqual(s.teardown(deliverFinal: true, transcript: "xin chào"), [])
    }

    func testCancelAndBackReleaseEverythingAndSendNothing() {
        var s = running()
        XCTAssertEqual(s.teardown(deliverFinal: false, transcript: "đang nói dở"), release)
        XCTAssertFalse(s.isHolding)
    }

    func testBackgroundIsACancel() {
        // The app resigning active calls `cancelListening()` = `teardown(deliverFinal: false)`.
        var s = running()
        let actions = s.teardown(deliverFinal: false, transcript: "abc")
        XCTAssertTrue(actions.contains(.removeTap) && actions.contains(.deactivateSession) && actions.contains(.stopEngine))
        XCTAssertFalse(actions.contains(.deliverFinal("abc")))
    }

    func testAFailedEngineStartStillRemovesTheTapAndTheSession() {
        // setActive ok, tap installed, engine.start() threw: the old code returned here with both still held.
        var s = VoiceSession()
        s.activatedSession(); s.installedTap()
        XCTAssertTrue(s.isHolding)
        XCTAssertEqual(s.teardown(deliverFinal: false, transcript: ""), [.removeTap, .deactivateSession])
        XCTAssertFalse(s.isHolding)
    }

    func testAFailedSessionActivationHoldsNothing() {
        var s = VoiceSession()
        XCTAssertFalse(s.isHolding)
        XCTAssertEqual(s.teardown(deliverFinal: false, transcript: ""), [])
    }

    func testTheRecogniserFinishingByItselfHandsTheTextOnceAndReleases() {
        var s = running()
        XCTAssertEqual(s.teardown(deliverFinal: true, transcript: "tìm quán cà phê"), release + [.deliverFinal("tìm quán cà phê")])
        // The user's own stop right after finds nothing left and delivers nothing.
        XCTAssertEqual(s.teardown(deliverFinal: true, transcript: "tìm quán cà phê"), [])
    }

    func testSilenceIsNotHandedOn() {
        var s = running()
        XCTAssertEqual(s.teardown(deliverFinal: true, transcript: "   \n"), release)
    }

    func testANewSessionMayDeliverAgain() {
        var s = running()
        _ = s.teardown(deliverFinal: true, transcript: "một")
        s.activatedSession(); s.installedTap(); s.startedEngine(); s.startedRecognition()
        XCTAssertEqual(s.teardown(deliverFinal: true, transcript: "hai"), release + [.deliverFinal("hai")])
    }

    func testReleaseOrderStopsInputBeforeTheTapAndTheTapBeforeTheSession() {
        var s = running()
        let a = s.teardown(deliverFinal: false, transcript: "")
        XCTAssertLessThan(a.firstIndex(of: .stopEngine)!, a.firstIndex(of: .removeTap)!)
        XCTAssertLessThan(a.firstIndex(of: .removeTap)!, a.firstIndex(of: .deactivateSession)!)
    }
}
