import XCTest
@testable import TappyAI

/// Smart Tools parity with the final Web (origin/p7/web-subscription 12db1a2): hero/title wording, localized currency names, the split-bill tip lines,
/// the 2000 / 500 / 80 character caps, the «copied» confirmation (2 s), and the translate result/error rules.
@MainActor
final class SmartToolsWebParityTests: XCTestCase {

    private func string(_ key: String, _ lang: String) throws -> String {
        let path = try XCTUnwrap(Bundle.main.path(forResource: lang, ofType: "lproj"))
        let value = try XCTUnwrap(Bundle(path: path)).localizedString(forKey: key, value: "MISSING", table: nil)
        XCTAssertNotEqual(value, "MISSING", "\(key) [\(lang)]")
        return value
    }

    private func service() -> UtilityToolsService { UtilityToolsService(api: MockAPIClient()) }

    // MARK: Wording (src/lib/i18n/w3/{currency,splitBill,fortune,translate}.ts, v3/web.ts)

    func testTheNewWordingIsTheWebs() throws {
        let rows: [(String, String, String)] = [
            ("currency.to", "vi", "Sang"), ("currency.to", "en", "To"),
            ("currency.USD", "vi", "Đô la Mỹ"), ("currency.JPY", "en", "Japanese Yen"),
            ("currency.rateStatusLive", "en", "Rates refreshed hourly"), ("currency.rateStatusFallback", "vi", "Tỷ giá ước tính"),
            ("splitBill.title", "vi", "Chia tiền"), ("splitBill.title", "en", "Split the bill"),
            ("splitBill.tipLabel", "vi", "Tip / phụ thu (%)"), ("splitBill.tipShortLabel", "en", "Tip"),
            ("fortune.zodiac.desc", "vi", "Nhập ngày sinh để biết cung của bạn, tính cách và vận may hiện tại."),
            ("translate.heroSubtitle", "en", "30 languages · No sign-in needed · Read results aloud"),
            ("translate.error.network", "vi", "Không thể kết nối. Vui lòng kiểm tra mạng."),
            ("translate.copied", "vi", "Đã chép!"), ("scan.copied", "en", "Copied!"),
            ("vietcontent.copied", "vi", "Đã copy"), ("vietcontent.copy", "en", "Copy"),
            ("smartTools.cta", "en", "Do more with TappyAI"),
        ]
        for (key, lang, want) in rows { XCTAssertEqual(try string(key, lang), want, "\(key) [\(lang)]") }
    }

    func testEveryCurrencyHasALocalizedNameInBothLanguages() throws {
        for cur in supportedCurrencies {
            XCTAssertFalse(try string("currency.\(cur.code)", "en").isEmpty, cur.code)
            XCTAssertFalse(try string("currency.\(cur.code)", "vi").isEmpty, cur.code)
            XCTAssertFalse(cur.localizedName.isEmpty, cur.code)
        }
    }

    // MARK: Split bill

    func testTipTextIsJavaScriptStringOfTheNumber() {
        XCTAssertEqual(SplitBillRows.tipText(10), "10")
        XCTAssertEqual(SplitBillRows.tipText(7.5), "7.5")
        XCTAssertEqual(SplitBillRows.tipText(0), "0")
    }

    func testIncludesTipLineCarriesTipAndTotal() {
        let line = SplitBillRows.includesTipLine(tip: 10, total: "1.100.000")
        XCTAssertTrue(line.contains("10%"), line)
        XCTAssertTrue(line.contains("1.100.000 đ"), line)
        XCTAssertTrue(line.hasPrefix("(") && line.hasSuffix(")"), line)
    }

    // MARK: Caps

    func testTranslateInputIsCappedAtTwoThousand() {
        let vm = TranslateViewModel(service: service())
        vm.inputText = String(repeating: "a", count: 2500)
        vm.enforceInputLimit()
        XCTAssertEqual(vm.inputText.count, 2000)
        XCTAssertFalse(vm.isOverLimit)
        vm.inputText = "short"
        vm.enforceInputLimit()
        XCTAssertEqual(vm.inputText, "short")
    }

    func testVietContentTopicIsCappedAtFiveHundred() {
        let vm = VietContentViewModel(service: service())
        vm.topic = String(repeating: "đ", count: 650)
        vm.enforceTopicLimit()
        XCTAssertEqual(vm.topic.count, 500)
        XCTAssertTrue(vm.canGenerate)
    }

    func testGroupNameIsCappedAtEighty() {
        XCTAssertEqual(GroupDiningViewModel.nameMax, 80)
        XCTAssertEqual(GroupDiningViewModel.capped(String(repeating: "x", count: 120)).count, 80)
        XCTAssertEqual(GroupDiningViewModel.capped("Nhóm ăn tối"), "Nhóm ăn tối")
    }

    // MARK: Translate

    func testANewRequestClearsThePreviousTranslation() async {
        let api = MockAPIClient()
        let vm = TranslateViewModel(service: UtilityToolsService(api: api))
        vm.inputText = "xin chào"
        api.stubbed = Data(#"{"translation":"hello"}"#.utf8)
        await vm.translate()
        XCTAssertEqual(vm.translation, "hello")
        api.stubbed = Data("{}".utf8)   // the second request fails to decode
        await vm.translate()
        XCTAssertEqual(vm.translation, "", "Web setTranslation('') on every request: no stale result next to a new error")
        XCTAssertNotNil(vm.error)
    }

    func testTranslateErrorsFollowTheWebRules() throws {
        let failed = try string("translate.error.failed", "en")
        XCTAssertEqual(TranslateViewModel.message(for: AppError.validation(message: "Text is too long")), "Text is too long")
        XCTAssertNotEqual(TranslateViewModel.message(for: AppError.validation(message: "Invalid request")), "Invalid request")
        XCTAssertEqual(TranslateViewModel.message(for: AppError.offline), NSLocalizedString("translate.error.network", comment: ""))
        XCTAssertEqual(TranslateViewModel.message(for: AppError.network(status: nil, code: nil)), NSLocalizedString("translate.error.network", comment: ""))
        XCTAssertEqual(TranslateViewModel.message(for: AppError.authentication(reason: .anonLimitReached)), NSLocalizedString("translate.error.dailyLimit", comment: ""))
        XCTAssertEqual(TranslateViewModel.message(for: AppError.unexpected(message: "x")), NSLocalizedString("translate.error.failed", comment: ""))
        XCTAssertFalse(failed.isEmpty)
    }

    // MARK: Copied confirmation

    func testCopyFeedbackWritesRaisesTheFlagAndDropsIt() async {
        var written = ""
        var flag = false
        CopyFeedback.copy("abc", write: { written = $0 }, flag: { flag = $0 }, delay: 0.05)
        XCTAssertEqual(written, "abc")
        XCTAssertTrue(flag)
        try? await Task.sleep(nanoseconds: 400_000_000)
        XCTAssertFalse(flag)
        XCTAssertEqual(CopyFeedback.seconds, 2, "Web setTimeout 2000")
    }

    func testEachToolCopiesItsResultAndShowsCopied() {
        let t = TranslateViewModel(service: service())
        t.translation = "hello"
        var out = ""
        t.copyTranslation(write: { out = $0 }, delay: 5)
        XCTAssertEqual(out, "hello"); XCTAssertTrue(t.copied)
        t.clear(); XCTAssertFalse(t.copied)

        let s = ScanViewModel(service: service())
        s.extractedText = "scanned"
        s.copyResult(write: { out = $0 }, delay: 5)
        XCTAssertEqual(out, "scanned"); XCTAssertTrue(s.copied)

        let v = VietContentViewModel(service: service())
        v.caption = "cap"; v.hashtags = "#a #b"
        v.copyCaption(write: { out = $0 }, delay: 5)
        XCTAssertEqual(out, "cap"); XCTAssertTrue(v.copiedCaption)
        v.copyAll(write: { out = $0 }, delay: 5)
        XCTAssertEqual(out, "cap\n\n#a #b", "Web `${caption}\\n\\n${hashtags}`"); XCTAssertTrue(v.copiedAll)
        v.reset()
        XCTAssertFalse(v.copiedAll); XCTAssertFalse(v.copiedCaption)
    }

    func testNothingIsCopiedWhenThereIsNoResult() {
        var called = false
        TranslateViewModel(service: service()).copyTranslation(write: { _ in called = true })
        ScanViewModel(service: service()).copyResult(write: { _ in called = true })
        VietContentViewModel(service: service()).copyCaption(write: { _ in called = true })
        XCTAssertFalse(called)
    }

    // MARK: Viet content / scan

    func testResultSubtitleIsPlatformDotTone() {
        let vm = VietContentViewModel(service: service())
        vm.platform = "tiktok"
        vm.tone = "funny"
        XCTAssertEqual(vm.resultSubtitle, "TikTok · " + NSLocalizedString("vietcontent.tone.funny", comment: ""))
    }

    func testScanFormatsAreTheWebs() {
        XCTAssertEqual(ScanViewModel.supportedFormats, ["JPG", "PNG", "WEBP"])
    }

    // MARK: Catalogue

    func testSafetyIsFirstInTheCatalogueAsOnTheWeb() {
        XCTAssertEqual(SmartTool.all.first?.id, .safety)
        XCTAssertEqual(SmartTool.home.first?.id, .safety)
    }
}
