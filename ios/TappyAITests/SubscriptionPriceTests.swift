import XCTest
@testable import TappyAI

/// Tests for the Pro subscription pricing flow and StoreKit 2 integration (Guideline 3.1.1).
/// Verifies authoritative Product ID, non-hardcoded dynamic pricing, error states, and localization.
@MainActor
final class SubscriptionPriceTests: XCTestCase {

    // MARK: - Product Catalog Invariants

    func testAuthoritativeProductIdMatchesAppStoreConnect() {
        XCTAssertEqual(ProductCatalog.proMonthlyId, "com.tappyai.ios.pro.monthly")
    }

    func testAllProductIdsContainsProMonthlyIdAsPrimary() {
        XCTAssertFalse(ProductCatalog.allProductIds.isEmpty)
        XCTAssertEqual(ProductCatalog.allProductIds.first, "com.tappyai.ios.pro.monthly")
        XCTAssertTrue(ProductCatalog.allProductIds.contains(ProductCatalog.proMonthlyId))
    }

    // MARK: - Sold plans (the web's five, in order)

    func testSalePlansAreTheWebsFiveInOrder() {
        XCTAssertEqual(ProductCatalog.saleProductIds,
                       ["tappy_pip_1w", "tappy_momo_1m", "tappy_promax_1m", "tappy_coco_3m", "tappy_promax_3m"])
        // Milo and Sunny are not sold any more.
        XCTAssertFalse(ProductCatalog.saleProductIds.contains("tappy_milo_6m"))
        XCTAssertFalse(ProductCatalog.saleProductIds.contains("tappy_sunny_12m"))
    }

    func testOnlyPipIsOneTime() {
        XCTAssertEqual(ProductCatalog.salePlans.filter(\.isOneTime).map(\.productId), [ProductCatalog.pipId])
    }

    func testEverySoldPlanIsRecognizedForRestoreAndUpdates() {
        for id in ProductCatalog.saleProductIds {
            XCTAssertTrue(ProductCatalog.allProductIds.contains(id), "\(id) must be accepted when a transaction arrives")
        }
        XCTAssertTrue(ProductCatalog.allProductIds.contains(ProductCatalog.proMonthlyId), "the first product keeps working for those who hold it")
    }

    func testSevenDayPackIsOfferedOnlyWhenTheServerSaysNotUsed() throws {
        func status(_ extra: String) throws -> SubscriptionStatusResponse {
            let json = "{\"isPro\":false,\"freeDailyLimit\":10,\"todayMessageCount\":0,\"remaining\":10\(extra)}"
            return try ResponseDecoder.json.decode(SubscriptionStatusResponse.self, from: Data(json.utf8))
        }
        XCTAssertTrue(try status(",\"pipUsed\":false").offersPipPack)
        XCTAssertFalse(try status(",\"pipUsed\":true").offersPipPack)
        // A server that does not send the field yet: the pack is NOT offered (no purchase the server would refuse after Apple took the money).
        XCTAssertFalse(try status("").offersPipPack)
    }

    func testBuyingASoldPlanPassesItsOwnProductId() async throws {
        let mock = MockPaymentProvider()
        _ = try await mock.purchase(productId: "tappy_coco_3m")
        XCTAssertEqual(mock.purchasedIds, ["tappy_coco_3m"])
    }

    // MARK: - AppProduct Model

    func testAppProductRetainsDynamicDisplayPrice() {
        let vndProduct = AppProduct(
            id: ProductCatalog.proMonthlyId,
            displayName: "TappyAI Pro",
            displayPrice: "179.000 đ"
        )
        XCTAssertEqual(vndProduct.id, "com.tappyai.ios.pro.monthly")
        XCTAssertEqual(vndProduct.displayName, "TappyAI Pro")
        XCTAssertEqual(vndProduct.displayPrice, "179.000 đ")

        // Also works with foreign storefront formats (e.g. USD, EUR)
        let usdProduct = AppProduct(
            id: ProductCatalog.proMonthlyId,
            displayName: "TappyAI Pro",
            displayPrice: "$6.99"
        )
        XCTAssertEqual(usdProduct.displayPrice, "$6.99")
    }

    // MARK: - Mock Payment Provider State Transitions

    func testPaymentProviderSuccessReturnsStoreProduct() async throws {
        let mock = MockPaymentProvider(
            productToReturn: AppProduct(
                id: ProductCatalog.proMonthlyId,
                displayName: "TappyAI Pro",
                displayPrice: "179.000 đ"
            )
        )
        let product = try await mock.availableProduct()
        XCTAssertNotNil(product)
        XCTAssertEqual(product?.id, "com.tappyai.ios.pro.monthly")
        XCTAssertEqual(product?.displayPrice, "179.000 đ")
    }

    func testPaymentProviderProductNotFoundReturnsNil() async throws {
        let mock = MockPaymentProvider(productToReturn: nil)
        let product = try await mock.availableProduct()
        XCTAssertNil(product)
    }

    func testPaymentProviderOfflineThrowsError() async {
        let mock = MockPaymentProvider(errorToThrow: AppError.offline)
        do {
            _ = try await mock.availableProduct()
            XCTFail("Expected offline error to be thrown")
        } catch let err as AppError {
            guard case .offline = err else {
                XCTFail("Expected .offline, got \(err)")
                return
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - Localization Strings

    func testRequiredSubscriptionStringsExist() {
        let requiredKeys = [
            "sub.title",
            "sub.pro",
            "sub.pro.desc",
            "sub.perMonth",
            "sub.upgradeProPrice",
            "sub.retryStore",
            "sub.error.loadFailed",
            "sub.error.offline",
            "sub.error.purchase",
            "sub.alreadyPro",
            "sub.manage",
            "sub.pending",
            "common.retry.action"
        ]
        for key in requiredKeys {
            let val = NSLocalizedString(key, comment: "")
            XCTAssertNotEqual(val, key, "Missing localization for key: \(key)")
            XCTAssertFalse(val.isEmpty, "Empty localization for key: \(key)")
        }
    }

    func testUpgradeProPriceSpecifierFormat() {
        let format = NSLocalizedString("sub.upgradeProPrice", comment: "")
        XCTAssertTrue(format.contains("%@"), "sub.upgradeProPrice must contain %@ format specifier")
        let formatted = String(format: format, "179.000 đ")
        XCTAssertTrue(formatted.contains("179.000 đ"), "Formatted price must contain the display price")
    }
}

// MARK: - Test Doubles

@MainActor
final class MockPaymentProvider: PaymentProvider {
    var productToReturn: AppProduct?
    var errorToThrow: Error?
    var purchaseResult: PurchaseResult = .success
    var restoreResult: Bool = false
    private(set) var openManagementCalled = false

    init(productToReturn: AppProduct? = nil, errorToThrow: Error? = nil) {
        self.productToReturn = productToReturn
        self.errorToThrow = errorToThrow
    }

    func availableProduct() async throws -> AppProduct? {
        if let err = errorToThrow {
            throw err
        }
        return productToReturn
    }

    var productsToReturn: [AppProduct] = []
    private(set) var purchasedIds: [String] = []

    func availableProducts() async throws -> [AppProduct] {
        if let err = errorToThrow {
            throw err
        }
        return productsToReturn
    }

    func purchase() async throws -> PurchaseResult {
        if let err = errorToThrow {
            throw err
        }
        return purchaseResult
    }

    func purchase(productId: String) async throws -> PurchaseResult {
        if let err = errorToThrow {
            throw err
        }
        purchasedIds.append(productId)
        return purchaseResult
    }

    func restorePurchases() async throws -> Bool {
        if let err = errorToThrow {
            throw err
        }
        return restoreResult
    }

    func openSubscriptionManagement() async {
        openManagementCalled = true
    }
}
