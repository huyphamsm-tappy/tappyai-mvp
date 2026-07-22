import Foundation

/// Lightweight dependency container (no third-party framework, per ADR-001/008 "avoid unnecessary frameworks").
/// Registration happens once at launch in the composition root (`AppDependencies`).
/// Resolution is by type. Thread-safe via a simple lock.
final class DIContainer: @unchecked Sendable {
    static let shared = DIContainer()

    private let lock = NSRecursiveLock()
    private var factories: [ObjectIdentifier: () -> Any] = [:]
    private var singletons: [ObjectIdentifier: Any] = [:]

    init() {}

    /// Register a lazily-created singleton for a type.
    func register<T>(_ type: T.Type, _ factory: @escaping () -> T) {
        lock.lock(); defer { lock.unlock() }
        factories[ObjectIdentifier(type)] = factory
    }

    /// Register an already-built instance.
    func register<T>(_ type: T.Type, instance: T) {
        lock.lock(); defer { lock.unlock() }
        singletons[ObjectIdentifier(type)] = instance
    }

    func resolve<T>(_ type: T.Type = T.self) -> T {
        lock.lock(); defer { lock.unlock() }
        let key = ObjectIdentifier(type)
        if let existing = singletons[key] as? T { return existing }
        guard let factory = factories[key], let made = factory() as? T else {
            fatalError("DIContainer: no registration for \(type). Register it in AppDependencies.")
        }
        singletons[key] = made
        return made
    }

    func reset() {
        lock.lock(); defer { lock.unlock() }
        factories.removeAll(); singletons.removeAll()
    }
}

/// Property-wrapper sugar for non-View code: `@Injected private var api: APIClient`.
@propertyWrapper
struct Injected<T> {
    private let container: DIContainer
    init(_ container: DIContainer = .shared) { self.container = container }
    var wrappedValue: T { container.resolve(T.self) }
}
