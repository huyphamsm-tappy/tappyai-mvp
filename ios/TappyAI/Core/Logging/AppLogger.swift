import Foundation
import os

/// Thin wrapper over `os.Logger`. Verbose/debug output is compiled/gated out of Release.
/// Categories keep the console navigable; performance signposts are available for profiling.
enum LogCategory: String {
    case app, network, auth, session, navigation, storage, ui, performance, chat, reviews, music
}

struct AppLogger {
    private let logger: Logger
    let category: LogCategory

    init(_ category: LogCategory) {
        self.category = category
        self.logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.tappyai.ios",
                             category: category.rawValue)
    }

    /// Debug/verbose — only emitted in DEBUG builds.
    func debug(_ message: @autoclosure () -> String) {
        #if DEBUG
        logger.debug("\(message(), privacy: .public)")
        #endif
    }

    func info(_ message: @autoclosure () -> String) {
        #if DEBUG
        logger.info("\(message(), privacy: .public)")
        #endif
    }

    /// Errors are always recorded (Release included), but keep sensitive data private.
    func error(_ message: @autoclosure () -> String) {
        logger.error("\(message(), privacy: .public)")
    }

    /// Lightweight performance marker. Use around expensive foundation operations only.
    func measure<T>(_ label: StaticString, _ work: () throws -> T) rethrows -> T {
        #if DEBUG
        let start = DispatchTime.now()
        defer {
            let ms = Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000
            logger.log("[perf] \(String(describing: label), privacy: .public): \(ms, format: .fixed(precision: 2))ms")
        }
        #endif
        return try work()
    }
}

extension AppLogger {
    static let app = AppLogger(.app)
    static let network = AppLogger(.network)
    static let auth = AppLogger(.auth)
    static let session = AppLogger(.session)
    static let navigation = AppLogger(.navigation)
    static let storage = AppLogger(.storage)
    static let ui = AppLogger(.ui)
    static let performance = AppLogger(.performance)
    static let chat = AppLogger(.chat)
    static let reviews = AppLogger(.reviews)
    static let music = AppLogger(.music)
}
