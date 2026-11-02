import XCTest
@testable import TappyAI

/// PrivacyInfo.xcprivacy and the Info.plist usage strings must match what the code sends.
final class PrivacyManifestTests: XCTestCase {

    private func plist(_ relative: String) throws -> [String: Any] {
        // Read from the source tree (as DeepLinkHandlerTests does for the entitlements).
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent(relative))
        return try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
    }

    private func declaredTypes() throws -> (types: Set<String>, entries: [[String: Any]]) {
        let manifest = try plist("TappyAI/Resources/PrivacyInfo.xcprivacy")
        XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false)
        XCTAssertEqual((manifest["NSPrivacyTrackingDomains"] as? [Any])?.count, 0, "no tracking domains")
        let entries = try XCTUnwrap(manifest["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        return (Set(entries.compactMap { $0["NSPrivacyCollectedDataType"] as? String }), entries)
    }

    func testCollectedDataTypesMatchTheCode() throws {
        let (types, entries) = try declaredTypes()
        for required in [
            "NSPrivacyCollectedDataTypePreciseLocation",   // unrounded lat/lng in the chat request
            "NSPrivacyCollectedDataTypeCoarseLocation",    // same nearby-places context (Play declares both)
            "NSPrivacyCollectedDataTypePhoneNumber",       // booking request (BookingFormView)
            "NSPrivacyCollectedDataTypeOtherDataTypes",    // date of birth (age gate)
            "NSPrivacyCollectedDataTypeEmailAddress",
            "NSPrivacyCollectedDataTypeName",
            "NSPrivacyCollectedDataTypeUserID",
            "NSPrivacyCollectedDataTypeOtherUserContent",  // chat, reviews, comments
            "NSPrivacyCollectedDataTypePhotosOrVideos",
            "NSPrivacyCollectedDataTypeProductInteraction",// clip watch time, likes, saves
            "NSPrivacyCollectedDataTypePurchaseHistory",   // StoreKit verify; Pro screen is a runtime server flag
            "NSPrivacyCollectedDataTypeDeviceID",          // FCM registration token (push)
        ] {
            XCTAssertTrue(types.contains(required), required)
        }
        for entry in entries {
            XCTAssertEqual(entry["NSPrivacyCollectedDataTypeTracking"] as? Bool, false, "\(entry)")
        }
    }

    /// Audio is collected only by the Music upload, which the COMPILE-TIME `ProductFlags.showMusic` hides.
    /// Turning Music back on is an app release, and this fails until the manifest is updated with it.
    /// Voice input is not audio collection (the OS transcribes; the app sends text only).
    func testAudioIsDeclaredExactlyWhileMusicIsShipped() throws {
        let (types, _) = try declaredTypes()
        XCTAssertEqual(types.contains("NSPrivacyCollectedDataTypeAudioData"), ProductFlags.showMusic)
    }

    /// The only required-reason API the app itself uses is UserDefaults (reason CA92.1). Reading a file's
    /// SIZE (`attributesOfItem[.size]`, ClipVideoFile / CreateReviewViewModel) is not on Apple's list —
    /// only creation/modification dates, disk space, boot time and active keyboards are.
    func testRequiredReasonApisAreOnlyUserDefaults() throws {
        let manifest = try plist("TappyAI/Resources/PrivacyInfo.xcprivacy")
        let apis = try XCTUnwrap(manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        XCTAssertEqual(apis.compactMap { $0["NSPrivacyAccessedAPIType"] as? String }, ["NSPrivacyAccessedAPICategoryUserDefaults"])
        XCTAssertEqual(apis.first?["NSPrivacyAccessedAPITypeReasons"] as? [String], ["CA92.1"])
    }

    func testEveryPermissionTheCodeRequestsHasAUsageString() throws {
        let info = try plist("TappyAI/Resources/Info.plist")
        for key in ["NSCameraUsageDescription", "NSMicrophoneUsageDescription", "NSPhotoLibraryUsageDescription",
                    "NSLocationWhenInUseUsageDescription",
                    // SFSpeechRecognizer.requestAuthorization (voice input) terminates the app without it.
                    "NSSpeechRecognitionUsageDescription"] {
            let value = info[key] as? String ?? ""
            XCTAssertFalse(value.isEmpty, key)
        }
    }
}
