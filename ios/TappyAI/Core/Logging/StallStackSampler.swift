import Foundation
import Darwin

/// Reads the MAIN thread's call stack from another thread while the main thread is stuck, so the diagnostics can say WHERE it is stuck.
///
/// A frozen screen cannot report itself, and without a Mac nobody can attach a profiler. So: `install()` (on the main thread, once) registers a
/// handler for SIGUSR2; `sample()` (from the stall watch's background task) sends that signal to the main thread. The handler runs ON the main
/// thread, even if it is looping or waiting, and copies the return addresses into a fixed buffer; `sample()` then names them with `dladdr`
/// (framework frames such as SwiftUI show their symbol; the app's own frames show the image offset, which a dSYM can name later).
/// Only code addresses and symbol names are recorded — nothing of a conversation.
enum StallStackSampler {
    private static let maxFrames = 40
    nonisolated(unsafe) private static var buffer = UnsafeMutablePointer<UnsafeMutableRawPointer?>.allocate(capacity: 40)
    nonisolated(unsafe) private static var captured: Int32 = 0
    nonisolated(unsafe) private static var finished = false
    nonisolated(unsafe) private static var mainThread: pthread_t?

    /// Call once, on the main thread.
    static func install() {
        guard mainThread == nil else { return }
        mainThread = pthread_self()
        var action = sigaction()
        action.__sigaction_u.__sa_handler = { _ in
            StallStackSampler.captured = backtrace(StallStackSampler.buffer, 40)
            StallStackSampler.finished = true
        }
        sigemptyset(&action.sa_mask)
        action.sa_flags = 0
        sigaction(SIGUSR2, &action, nil)
    }

    /// One line per frame, innermost first. Empty when not installed; one explanatory line when the main thread did not take the signal in time.
    static func sample() -> [String] {
        guard let thread = mainThread else { return [] }
        finished = false
        captured = 0
        guard pthread_kill(thread, SIGUSR2) == 0 else { return ["(could not signal the main thread)"] }
        var waited = 0
        while !finished && waited < 60 { usleep(10_000); waited += 1 }
        guard finished else { return ["(the main thread did not take the signal within 0.6 s)"] }
        var lines: [String] = []
        for i in 0..<Int(captured) {
            guard let address = buffer[i] else { continue }
            var info = Dl_info()
            if dladdr(address, &info) != 0 {
                let image = info.dli_fname.map { (String(cString: $0) as NSString).lastPathComponent } ?? "?"
                let base = info.dli_fbase.map { UInt(bitPattern: address) &- UInt(bitPattern: $0) } ?? 0
                let symbol = info.dli_sname.map { String(cString: $0) } ?? "?"
                lines.append("\(i) \(image)+0x\(String(base, radix: 16)) \(symbol.prefix(110))")
            } else {
                lines.append("\(i) 0x\(String(UInt(bitPattern: address), radix: 16))")
            }
        }
        return lines
    }
}
