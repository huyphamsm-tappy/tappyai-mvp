import Foundation

/// While a chat turn streams, notices when the main thread stops answering and writes it to the diagnostics (durations only).
///
/// A frozen screen cannot report itself: the code that would run on the main thread is the code that is stuck. This watch lives on a background
/// task. Every second it asks the main queue to set a flag; if the flag is still unset after 1.5 s it records «main thread stalled» (so even a stall
/// that never ends leaves a line), and when the main thread answers again it records how long it was gone. The owner copies the diagnostics from
/// the subscription screen after the app was quit, and the NEXT launch still shows the line.
final class MainThreadStallWatch: @unchecked Sendable {
    private var task: Task<Void, Never>?
    private let lock = NSLock()

    /// Starts watching (nothing happens when it is already watching).
    func start(context: @escaping @Sendable () -> String = { "" }) {
        lock.lock(); defer { lock.unlock() }
        stopGeneration += 1 // a new turn cancels a stop that was waiting
        guard task == nil else { return }
        task = Task.detached(priority: .utility) {
            while !Task.isCancelled {
                let flag = AnswerFlag()
                let sent = Date()
                DispatchQueue.main.async { flag.set() }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                if Task.isCancelled { return }
                if !flag.isSet {
                    DiagnosticSnapshot.shared.record("main thread stalled over 1.5 s while a chat turn streams \(context())", isError: true)
                    // WHERE it is stuck: the main thread's own stack, read from here (names for system frames, image offsets for the app's).
                    // Every frame of the app's own image is kept (they name the view); the long runs of SwiftUI frames are thinned to the first 18 and
                    // the app frames after them, so the diagnostics (120 lines) keep the part that matters.
                    let frames = StallStackSampler.sample()
                    var kept: [String] = []
                    for (i, line) in frames.enumerated() where i < 18 || line.contains(" TappyAI+") || line.contains("\(i) TappyAI+") { kept.append(line) }
                    for line in kept.prefix(70) {
                        DiagnosticSnapshot.shared.record("stall stack: \(line)", isError: true)
                    }
                    while !flag.isSet, !Task.isCancelled { try? await Task.sleep(nanoseconds: 250_000_000) }
                    if flag.isSet {
                        DiagnosticSnapshot.shared.record("main thread answered again after \(String(format: "%.1f", Date().timeIntervalSince(sent))) s")
                    }
                }
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }
    }

    func stop() {
        lock.lock()
        stopGeneration += 1
        task?.cancel()
        task = nil
        lock.unlock()
    }

    private var stopGeneration = 0

    /// Keeps watching for a while after the turn ended: the final drawing of a finished answer (cards, follow-ups) happens AFTER the stream is
    /// done, and a hang there left no line because the watch had already stopped (diagnostics 27/11 build 293: the stream finished, then silence).
    /// A turn that starts meanwhile cancels the pending stop.
    func stopLater(after seconds: Double) {
        lock.lock()
        stopGeneration += 1
        let generation = stopGeneration
        lock.unlock()
        Task.detached { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard let self else { return }
            self.lock.lock()
            if self.stopGeneration == generation {
                self.task?.cancel()
                self.task = nil
            }
            self.lock.unlock()
        }
    }
}

private final class AnswerFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    func set() { lock.lock(); value = true; lock.unlock() }
    var isSet: Bool { lock.lock(); defer { lock.unlock() }; return value }
}
