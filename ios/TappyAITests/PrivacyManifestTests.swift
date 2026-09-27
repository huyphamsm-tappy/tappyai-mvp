import XCTest

/// PrivacyInfo.xcprivacy and the Info.plist usage strings must match what the code sends.
final class PrivacyManifestTests: XCTestCase {

    private func plist(_ relative: String) throws -> [String: Any] {
        // Read from the source tree (as DeepLinkHandlerTests does for the entitlements).
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent(relative))
        return try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
    }

    func testCollectedDataTypesMatchTheCode() throws {
        let manifest = try plist("TappyAI/Resources/PrivacyInfo.xcprivacy")
        XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false)
        let entries = try XCTUnwrap(manifest["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        let types = Set(entries.compactMap { $0["NSPrivacyCollectedDataType"] as? String })

        for required in [
            "NSPrivacyCollectedDataTypePreciseLocation",   // unrounded lat/lng in the chat request
            "NSPrivacyCollectedDataTypePhoneNumber",       // booking request
            "NSPrivacyCollectedDataTypeOtherDataTypes",    // date of birth (age gate)
            "NSPrivacyCollectedDataTypeAudioData",         // Music audio upload (flag-gated)
            "NSPrivacyCollectedDataTypeEmailAddress",
            "NSPrivacyCollectedDataTypeName",
            "NSPrivacyCollectedDataTypeUserID",
            "NSPrivacyCollectedDataTypePhotosOrVideos",
        ] {
            XCTAssertTrue(types.contains(required), required)
        }
        for entry in entries {
            XCTAssertEqual(entry["NSPrivacyCollectedDataTypeTracking"] as? Bool, false, "\(entry)")
        }
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
