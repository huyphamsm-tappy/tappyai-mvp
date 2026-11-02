import XCTest
@testable import TappyAI

/// The shared decoder must serve BOTH model styles: camelCase properties (no CodingKeys) and
/// explicit snake_case CodingKeys. With `.convertFromSnakeCase` alone the second style fails with
/// keyNotFound (found by the CI screenshot run 30/09: Saved stayed on its error state).
final class ResponseDecoderKeysTests: XCTestCase {
    func testExplicitSnakeCaseCodingKeysDecode() throws {
        let json = #"{"favorites":[{"id":"f1","place_id":"p1","place_name":"Phở","place_address":"HN","place_type":"food","created_at":"2026-09-20T08:00:00.000Z"}]}"#
        let response = try ResponseDecoder.json.decode(PlacesService.FavoritesResponse.self, from: Data(json.utf8))
        XCTAssertEqual(response.favorites.first?.placeId, "p1")
        XCTAssertEqual(response.favorites.first?.placeName, "Phở")
    }

    func testSavedReviewSnakeKeysDecode() throws {
        let json = #"{"reviews":[{"id":"r1","place_name":null,"body":"x","photos":[],"thumbnail":null,"content_type":"video","saved_at":"2026-09-25T09:00:00.000Z"}]}"#
        let response = try ResponseDecoder.json.decode(PlacesService.SavedReviewsResponse.self, from: Data(json.utf8))
        XCTAssertEqual(response.reviews.first?.contentType, "video")
    }

    func testUserProfileSnakeKeysDecode() throws {
        let json = #"{"full_name":"An","avatar_url":"https://x/y.png","email":"a@b.c","bio":"","cover_url":"https://x/c.png"}"#
        let profile = try ResponseDecoder.json.decode(UserProfile.self, from: Data(json.utf8))
        XCTAssertEqual(profile.fullName, "An")
        XCTAssertEqual(profile.coverUrl, "https://x/c.png")
    }

    func testCamelCasePropertiesStillDecodeFromSnakeJSON() throws {
        let json = #"{"id":"u1","full_name":"An","avatar_url":null,"follower_count":3,"following_count":1,"review_count":2,"is_following":false,"is_self":true}"#
        let profile = try ResponseDecoder.json.decode(PublicUserProfile.self, from: Data(json.utf8))
        XCTAssertEqual(profile.followerCount, 3)
        XCTAssertEqual(profile.isSelf, true)
    }

    func testCamelCaseRuleMatchesFoundation() {
        XCTAssertEqual(ResponseDecoder.camelCase("place_id"), "placeId")
        XCTAssertEqual(ResponseDecoder.camelCase("created_at"), "createdAt")
        XCTAssertEqual(ResponseDecoder.camelCase("_private_key"), "_privateKey")
        XCTAssertEqual(ResponseDecoder.camelCase("plain"), "plain")
    }

    func testNonJSONPassesThroughUntouched() {
        let raw = Data("not json".utf8)
        XCTAssertEqual(ResponseDecoder.withCamelCaseAliases(raw), raw)
    }
}
