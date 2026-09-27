import Foundation

/// Lightweight dependency container (no third-party framework, per ADR-001/008 "avoid unnecessary frameworks").
/// Registration happens once at launch in the composition root (`AppDependencies`).
/// Resolution is by type.
///
/// Thread-safety: the lock guards the two dictionaries only, and is never held while a factory
/// runs. A factory may itself resolve other types, or be slow; calling it under the lock was a
/// deadlock waiting to happen as soon as two threads resolved in opposite orders. So `resolve`
/// reads under the lock, builds OUTSIDE it, then stores under the lock with "first stored wins":
/// if two threads race to build the same singleton, both get the instance that was stored first.
/// `@unchecked Sendable` because the mutable state is only touched inside `locked`.
final class DIContainer: @unchecked Sendable {
    static let shared = DIContainer()

    private let lock = NSLock()
    private var factories: [ObjectIdentifier: () -> Any] = [:]
    private var singletons: [ObjectIdentifier: Any] = [:]

    init() {}

    /// Register a lazily-created singleton for a type.
    func register<T>(_ type: T.Type, _ factory: @escaping () -> T) {
        locked { factories[ObjectIdentifier(type)] = factory }
    }

    /// Register an already-built instance.
    func register<T>(_ type: T.Type, instance: T) {
        locked { singletons[ObjectIdentifier(type)] = instance }
    }

    func resolve<T>(_ type: T.Type = T.self) -> T {
        let key = ObjectIdentifier(type)
        // 1. Under the lock: an existing instance, or the factory to build one.
        let (existing, factory): (Any?, (() -> Any)?) = locked { (singletons[key], factories[key]) }
        if let existing = existing as? T { return existing }
        guard let factory else {
            fatalError("DIContainer: no registration for \(type). Register it in AppDependencies.")
        }
        // 2. Outside the lock: the factory may resolve other types or take its time.
        guard let made = factory() as? T else {
            fatalError("DIContainer: factory for \(type) returned the wrong type.")
        }
        // 3. Under the lock again: first stored wins, so racing resolvers share one instance.
        return locked {
            if let winner = singletons[key] as? T { return winner }
            singletons[key] = made
            return made
        }
    }

    func reset() {
        locked {
            factories.removeAll()
            singletons.removeAll()
        }
    }

    private func locked<R>(_ body: () -> R) -> R {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }
}

/// Property-wrapper sugar for non-View code: `@Injected private var api: APIClient`.
@propertyWrapper
struct Injected<T> {
    private let container: DIContainer
    init(_ container: DIContainer = .shared) { self.container = container }
    var wrappedValue: T { container.resolve(T.self) }
}
