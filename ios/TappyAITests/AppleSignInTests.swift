import XCTest
@testable import TappyAI

/// Sign in with Apple: hidden until the server enables it; nonce handling for Supabase.
final class AppleSignInTests: XCTestCase {

    func testHiddenUntilTheServerEnablesIt() {
        XCTAssertFalse(AppleSignIn.isEnabled(flag: nil, providers: ["google", "zalo", "email"]), "every server today")
        XCTAssertFalse(AppleSignIn.isEnabled(flag: false, providers: []))
        XCTAssertTrue(AppleSignIn.isEnabled(flag: true, providers: []))
        XCTAssertTrue(AppleSignIn.isEnabled(flag: nil, providers: ["google", "apple"]))
    }

    func testFlagIsOptionalInTheConfigContract() throws {
        let without = try ResponseDecoder.json.decode(AppConfig.Flags.self,
                                                      from: Data(#"{"showProUpgrade":false}"#.utf8))
        XCTAssertNil(without.appleSignIn)
        let with = try ResponseDecoder.json.decode(AppConfig.Flags.self,
                                                   from: Data(#"{"showProUpgrade":false,"appleSignIn":true}"#.utf8))
        XCTAssertEqual(with.appleSignIn, true)
    }

    func testNonceIsRandomAndHashedForApple() {
        let a = AppleSignIn.randomNonce(), b = AppleSignIn.randomNonce()
        XCTAssertEqual(a.count, 32)
        XCTAssertNotEqual(a, b)
        // SHA-256("abc"), the FIPS 180-2 test vector.
        XCTAssertEqual(AppleSignIn.sha256("abc"),
                       "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }
}
