import Foundation

/// The reply style the person chose in "Tappy knows" (tone and length), as the chat request carries it: `responseStyle: {tone, length}`
/// (web `ChatInterface`: `localStorage.tappy_response_style`; server `route.ts` turns each into one line of the prompt). Only the values the server
/// knows are sent: it ignores anything else, and a hand-edited setting must not reach the request.
enum ResponseStyle {
    static let toneKey = "tappy_response_tone"
    static let lengthKey = "tappy_response_length"

    static let tones: Set<String> = ["friendly", "neutral", "formal"]
    static let lengths: Set<String> = ["short", "detailed"]

    /// The style to send, or nil when the person chose neither.
    static func current(_ defaults: UserDefaults = .standard) -> [String: String]? {
        wire(tone: defaults.string(forKey: toneKey), length: defaults.string(forKey: lengthKey))
    }

    static func wire(tone: String?, length: String?) -> [String: String]? {
        var style: [String: String] = [:]
        if let tone, tones.contains(tone) { style["tone"] = tone }
        if let length, lengths.contains(length) { style["length"] = length }
        return style.isEmpty ? nil : style
    }
}
