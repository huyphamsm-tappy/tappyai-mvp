import XCTest
import UIKit
@testable import TappyAI

/// Scam Shield: the on-device message reading, the QR decoding and classification, and the privacy rules
/// (nothing leaves the phone for a message the matcher can read, and a QR picture is never uploaded).
@MainActor
final class ScamMessageAndQRTests: XCTestCase {

    // MARK: Message matcher

    private func outcome(_ text: String) -> ScamMessageOutcome { ScamMessageMatcher.analyze(text) }

    private func number(_ o: ScamMessageOutcome) -> Int? {
        if case .matched(let n, _, _) = o { return n }
        return nil
    }

    func testTheMoonCakeParcelWithAQRIsTheFakeQRScenario() {
        let o = outcome("Bưu phẩm Trung thu của bạn đang bị giữ. Vui lòng quét mã QR để thanh toán phí 15.000đ và nhận hàng.")
        XCTAssertEqual(number(o), 19, "«Mã QR giả»")
        XCTAssertTrue(o.signals.contains(.qr))
    }

    func testAFineNoticeWithALinkIsTheFakeFineScenario() {
        let o = outcome("THONG BAO: Phương tiện của bạn có phạt nguội chưa nộp. Nộp phạt tại http://nopphat-gov.xyz/tra-cuu trong 24h.")
        XCTAssertEqual(number(o), 22, "«Giả thông báo phạt nguội»")
        XCTAssertEqual(o.links, ["http://nopphat-gov.xyz/tra-cuu"])
    }

    func testPoliceAndTransferIsTheAuthorityScenario() {
        XCTAssertEqual(number(outcome("Tôi là Công an quận. Anh liên quan vụ án, hãy chuyển tiền vào tài khoản an toàn để xác minh.")), 3)
    }

    func testABankAskingForAnOTPIsTheFakeBankStaff() {
        XCTAssertEqual(number(outcome("Ngân hàng Vietcombank thông báo tài khoản của bạn bất thường, vui lòng cung cấp mã OTP để xác minh.")), 4)
    }

    func testRemoteControlSoftwareIsOneStrongSignal() {
        XCTAssertEqual(number(outcome("Cài AnyDesk để nhân viên hỗ trợ giúp bạn.")), 20)
    }

    func testAPrizeWithAFeeIsTheFakePrize() {
        XCTAssertEqual(number(outcome("Chúc mừng bạn trúng thưởng iPhone! Đóng phí vận chuyển 200k để nhận quà.")), 23)
    }

    // 🚨 Ordinary messages are NOT flagged.
    func testOrdinaryMessagesAreNotFlagged() {
        let normal = [
            "Đơn hàng DH12345 đã giao thành công. Cảm ơn bạn đã mua sắm.",
            "Vietcombank: TK 0011xxxx +500,000 VND lúc 10:21 ngày 02/10. Số dư: 1,250,000 VND.",
            "Chiều nay mình đi ăn phở nhé, 6 giờ ở chỗ cũ.",
            "Mã OTP của bạn là 482913. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.",
            "Mai họp lúc 9h phòng 3, nhớ mang laptop."
        ]
        for text in normal {
            let o = outcome(text)
            XCTAssertEqual(o, .noSigns(links: []), "must not be flagged: \(text)")
        }
    }

    func testSomethingOddButUnnamedIsUnsureNeverSafe() {
        let o = outcome("Bạn đã trúng thưởng một phần quà đặc biệt.")
        if case .noSigns = o { XCTFail("a prize notice is never «no signs»") }
    }

    func testLinksAreExtractedWithoutTrailingPunctuationAndNeverFetched() {
        XCTAssertEqual(ScamMessageMatcher.extractLinks("Xem tại https://a.example/x?y=1, hoặc www.b.vn. Cảm ơn"), ["https://a.example/x?y=1", "www.b.vn"])
        XCTAssertEqual(ScamMessageMatcher.extractLinks("không có link ở đây"), [])
    }

    func testNormalizationFoldsVietnamese() {
        XCTAssertEqual(ScamMessageMatcher.normalize("Đừng CHUYỂN TIỀN!!"), "dung chuyen tien")
    }

    // MARK: QR classification

    func testQRKinds() {
        XCTAssertEqual(QRPayload.classify("https://evil.example/pay"), .link("https://evil.example/pay"))
        XCTAssertEqual(QRPayload.classify("www.evil.example"), .link("https://www.evil.example"))
        XCTAssertEqual(QRPayload.classify("WIFI:T:WPA;S:Cafe;P:12345678;;"), .wifi)
        XCTAssertEqual(QRPayload.classify("BEGIN:VCARD\nFN:A"), .contact)
        XCTAssertEqual(QRPayload.classify("tel:+84901234567"), .phone)
        XCTAssertEqual(QRPayload.classify("smsto:+84901234567:hi"), .sms)
        XCTAssertEqual(QRPayload.classify("mailto:a@b.vn"), .email)
        XCTAssertEqual(QRPayload.classify("000201010211…"), .payment)
        XCTAssertEqual(QRPayload.classify("bitcoin:bc1qxyz"), .crypto)
        XCTAssertEqual(QRPayload.classify("xin chào"), .text("xin chào"))
        XCTAssertEqual(QRPayload.classify("myapp://do/something"), .text("myapp://do/something"), "an app link is shown, never opened")
    }

    func testEveryKindHasAWarningAndANameInTheCatalogue() {
        let all: [QRPayload] = [.link("https://x.vn"), .wifi, .contact, .phone, .sms, .email, .payment, .crypto, .text("x")]
        for p in all {
            XCTAssertNotEqual(NSLocalizedString(p.kindKey, comment: ""), p.kindKey, p.kindKey)
            XCTAssertNotEqual(NSLocalizedString(p.warningKey, comment: ""), p.warningKey, p.warningKey)
        }
    }

    // MARK: QR decoding (Vision, on the phone)

    func testAGeneratedQRIsReadBack() throws {
        let image = try XCTUnwrap(QRImageDecoder.makeImage("https://phat-nguoi-gov.xyz/nop"))
        XCTAssertEqual(QRImageDecoder.decode(image), ["https://phat-nguoi-gov.xyz/nop"])
        let wifi = try XCTUnwrap(QRImageDecoder.makeImage("WIFI:T:WPA;S:Cafe;P:12345678;;"))
        XCTAssertEqual(QRImageDecoder.decode(wifi), ["WIFI:T:WPA;S:Cafe;P:12345678;;"])
    }

    func testAPictureWithoutACodeDecodesToNothing() throws {
        UIGraphicsBeginImageContext(CGSize(width: 200, height: 200))
        UIColor.lightGray.setFill(); UIRectFill(CGRect(x: 0, y: 0, width: 200, height: 200))
        let blank = try XCTUnwrap(UIGraphicsGetImageFromCurrentImageContext())
        UIGraphicsEndImageContext()
        XCTAssertEqual(QRImageDecoder.decode(blank), [])
    }

    // MARK: Privacy — what is (not) sent

    private func makeVM(_ api: MockAPIClient, consent: AIConsentCoordinator? = nil) -> ScamShieldViewModel {
        ScamShieldViewModel(service: UtilityToolsService(api: api, consent: consent))
    }

    func testReadingAMessageSendsNothing() {
        let api = MockAPIClient()
        let vm = makeVM(api)
        vm.messageText = "Quét mã QR để thanh toán phí nhận quà"
        vm.checkMessage()
        XCTAssertNotNil(vm.messageOutcome)
        XCTAssertTrue(api.sentEndpoints.isEmpty, "the message is read on the phone only")
    }

    func testANonLinkQRIsOnlyNamedNeverSent() async {
        let api = MockAPIClient()
        let vm = makeVM(api)
        await vm.handleQR(texts: ["WIFI:T:WPA;S:Cafe;P:12345678;;"])
        XCTAssertEqual(vm.qrPayload, .wifi)
        XCTAssertTrue(api.sentEndpoints.isEmpty, "nothing is sent for a code that is not a link")
        XCTAssertFalse(vm.linkFromQR)
    }

    func testAQRLinkSendsOnlyTheLinkTextToTheLinkCheck() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"url":"https://evil.example/x","risk":{"score":82,"confidence":70,"level":"HIGH"},"evidence":{"items":[]},"actions":[]}"#.utf8)
        let vm = makeVM(api)
        await vm.handleQR(texts: ["https://evil.example/x"])
        XCTAssertEqual(api.sentEndpoints.map(\.path), ["/api/scam-shield/check"], "one request, to the link check, nothing else")
        let body = try XCTUnwrap(api.sentEndpoints.first?.body)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: body) as? [String: String], ["url": "https://evil.example/x"], "only the link, never the picture")
        XCTAssertTrue(vm.linkFromQR)
        XCTAssertEqual(vm.result?.risk.level, .high)
    }

    func testNoCodeInThePictureSaysSoPlainly() async {
        let vm = makeVM(MockAPIClient())
        await vm.handleQR(texts: [])
        XCTAssertNil(vm.qrPayload)
        XCTAssertNotNil(vm.qrMessage)
    }

    func testTheDeeperAnalysisSendsNothingWhenThePersonSaysNotNow() async {
        let store = AIConsentStore(defaults: UserDefaults(suiteName: "ScamTests-\(UUID().uuidString)")!, enforced: true)
        let consent = AIConsentCoordinator(store: store)
        let api = MockAPIClient()
        let vm = makeVM(api, consent: consent)
        vm.messageText = "Bạn đã trúng thưởng một phần quà đặc biệt."
        let task = Task { await vm.analyzeMessageDeeper() }
        while !consent.isPresenting { await Task.yield() }
        consent.later()
        await task.value
        XCTAssertTrue(api.sentEndpoints.isEmpty, "«Để sau»: the text never left the phone")
        XCTAssertNil(vm.messageAnalysis)
        XCTAssertNotNil(vm.messageAnalysisFailure)
    }

    func testTheAnalyzeRouteIsAnAIPathHeldBackBeforeConsent() {
        let s = AIConsentStore(defaults: UserDefaults(suiteName: "ScamTests-\(UUID().uuidString)")!, enforced: true)
        XCTAssertTrue(s.blocks(path: "/api/scam-shield/analyze"))
        XCTAssertFalse(s.blocks(path: "/api/scam-shield/check"), "the link check carries only a link and needs no AI consent")
    }

    func testAnUnreadableServerVerdictIsNeverSafe() throws {
        let a = try ResponseDecoder.json.decode(ScamMessageAnalysis.self, from: Data(#"{"advice":null}"#.utf8))
        XCTAssertEqual(a.level, .unknown)
        XCTAssertFalse(a.isUsable)
    }

    func testTheScenarioNumbersTheMatcherUsesExistInTheBundledData() {
        let known = Set(ScamKnowledge.load().scenarios.map(\.officialNumber))
        guard !known.isEmpty else { return XCTFail("bundled dataset missing") }
        for sample in ["quét mã qr thanh toán", "phạt nguội link http://a.xyz", "công an chuyển tiền xác minh", "ngân hàng otp"] {
            if case .matched(let n, _, _) = outcome(sample) { XCTAssertTrue(known.contains(n), "#\(n)") }
        }
    }
}

final class ThemeModeTests: XCTestCase {
    func testTheDefaultIsDarkLikeTheWeb() {
        XCTAssertEqual(ThemeMode.defaultMode, .dark)
        XCTAssertEqual(ThemeMode.resolve(stored: nil), .dark)
        XCTAssertEqual(ThemeMode.dark.colorScheme, .dark)
    }

    func testAStoredChoiceAlwaysWins() {
        XCTAssertEqual(ThemeMode.resolve(stored: "light"), .light)
        XCTAssertEqual(ThemeMode.resolve(stored: "system"), .system)
        XCTAssertEqual(ThemeMode.resolve(stored: "dark"), .dark)
        XCTAssertEqual(ThemeMode.resolve(stored: "nonsense"), .dark, "an unreadable value falls back to the default")
    }

    @MainActor
    func testTheManagerRemembersTheChoice() {
        let suite = UserDefaults(suiteName: "ThemeTests-\(UUID().uuidString)")!
        let store = UserDefaultsStore(suite)
        let first = ThemeManager(store: store)
        XCTAssertEqual(first.mode, .dark, "first launch: dark")
        first.mode = .light
        XCTAssertEqual(ThemeManager(store: store).mode, .light, "remembered")
        first.mode = .system
        XCTAssertEqual(ThemeManager(store: store).mode, .system)
    }
}
