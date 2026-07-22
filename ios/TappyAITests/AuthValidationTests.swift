import XCTest
@testable import TappyAI

final class AuthValidationTests: XCTestCase {
    func testEmail() {
        XCTAssertTrue(AuthValidation.isValidEmail("a@b.com"))
        XCTAssertFalse(AuthValidation.isValidEmail("nope"))
        XCTAssertFalse(AuthValidation.isValidEmail("a@bcom"))
    }

    func testOTP() {
        XCTAssertTrue(AuthValidation.isValidOTP("123456"))
        XCTAssertFalse(AuthValidation.isValidOTP("12345"))
        XCTAssertFalse(AuthValidation.isValidOTP("12345a"))
    }

    func testPassword() {
        XCTAssertTrue(AuthValidation.isValidPassword("secret"))
        XCTAssertFalse(AuthValidation.isValidPassword("123"))
    }

    func testName() {
        XCTAssertTrue(AuthValidation.isNonEmptyName("Huy"))
        XCTAssertFalse(AuthValidation.isNonEmptyName("   "))
    }
}
