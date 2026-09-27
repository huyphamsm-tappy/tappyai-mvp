import XCTest
@testable import TappyAI

/// Factories run outside the container's lock; racing resolvers share one singleton.
final class DIContainerTests: XCTestCase {
    private final class Leaf {}
    private final class Parent { let leaf: Leaf; init(leaf: Leaf) { self.leaf = leaf } }
    private final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var value = 0
        func increment() { lock.lock(); value += 1; lock.unlock() }
        var count: Int { lock.lock(); defer { lock.unlock() }; return value }
    }
    private final class Identities: @unchecked Sendable {
        private let lock = NSLock()
        private var ids = Set<ObjectIdentifier>()
        func insert(_ id: ObjectIdentifier) { lock.lock(); ids.insert(id); lock.unlock() }
        var distinct: Int { lock.lock(); defer { lock.unlock() }; return ids.count }
    }

    func testAFactoryCanResolveAnotherType() {
        // The lock is a plain NSLock and is not held while a factory runs: a factory that
        // resolves a dependency would deadlock here otherwise.
        let container = DIContainer()
        container.register(Leaf.self) { Leaf() }
        container.register(Parent.self) { Parent(leaf: container.resolve(Leaf.self)) }
        let parent = container.resolve(Parent.self)
        XCTAssertTrue(parent.leaf === container.resolve(Leaf.self))
        XCTAssertTrue(parent === container.resolve(Parent.self), "a singleton")
    }

    func testConcurrentResolversShareOneInstance() {
        let container = DIContainer()
        let built = Counter()
        container.register(Leaf.self) {
            built.increment()
            Thread.sleep(forTimeInterval: 0.01)   // widen the race window
            return Leaf()
        }
        let seen = Identities()
        DispatchQueue.concurrentPerform(iterations: 16) { _ in
            seen.insert(ObjectIdentifier(container.resolve(Leaf.self)))
        }
        XCTAssertEqual(seen.distinct, 1, "first stored wins: every caller gets the same instance")
        XCTAssertGreaterThanOrEqual(built.count, 1)
    }

    func testRegisteredInstanceWins() {
        let container = DIContainer()
        let leaf = Leaf()
        container.register(Leaf.self, instance: leaf)
        XCTAssertTrue(container.resolve(Leaf.self) === leaf)
        container.reset()
        container.register(Leaf.self) { Leaf() }
        XCTAssertFalse(container.resolve(Leaf.self) === leaf)
    }
}
