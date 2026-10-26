import XCTest
import StoreKit
import StoreKitTest
@testable import TappyAI

/// Loads the Pro product through a StoreKit test session backed by `Products.storekit`.
/// This proves the app's request path against the local configuration only. It does not
/// prove App Store Connect state or App Store Sandbox behaviour.
@MainActor
final class StoreKitProductLoadTests: XCTestCase {
    private var session: SKTestSession!

    override func setUpWithError() throws {
        session = try SKTestSession(configurationFileNamed: "Products")
        session.disableDialogs = true
        session.clearTransactions()
    }

    override func tearDown() {
        session = nil
        super.tearDown()
    }

    func testStoreKitConfigurationReturnsProMonthlyProduct() async throws {
        let products = try await Product.products(for: [ProductCatalog.proMonthlyId])
        let everyId = try await Product.products(for: ProductCatalog.allProductIds).map(\.id)
        XCTAssertEqual(products.map(\.id), [ProductCatalog.proMonthlyId], "all configured ids that StoreKit returned: \(everyId)")
    }

    func testProviderMapsProMonthlyProductWithDisplayPrice() async throws {
        let provider = StoreKitProvider(api: MockAPIClient())
        let product = try await provider.availableProduct()
        XCTAssertEqual(product?.id, ProductCatalog.proMonthlyId)
        XCTAssertFalse(product?.displayPrice.isEmpty ?? true)
    }
}
