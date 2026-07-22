import XCTest

/// Minimal launch smoke test. Feature UI flows are added with their phases.
final class LaunchSmokeUITests: XCTestCase {
    func testAppLaunches() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertEqual(app.state, .runningForeground)
    }
}
