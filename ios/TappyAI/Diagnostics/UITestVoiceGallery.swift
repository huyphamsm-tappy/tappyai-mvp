import Combine
import SwiftUI

#if DEBUG
// The listening screen with a fixture recogniser, for the CI pictures. DEBUG builds only, development-only like the rest of
// `Diagnostics`: no microphone is opened, and the sample words below are test content.

/// A recogniser that only reports what it was given.
@MainActor
final class StaticVoice: VoiceRecognizing {
    var transcript: String
    var isListening: Bool
    var error: String?
    private let subject = PassthroughSubject<Void, Never>()
    var changes: AnyPublisher<Void, Never> { subject.eraseToAnyPublisher() }

    init(transcript: String, isListening: Bool, error: String?) {
        self.transcript = transcript; self.isListening = isListening; self.error = error
    }

    func begin() { if error == nil { isListening = true; subject.send() } }
    func halt() { isListening = false; subject.send() }
}

struct VoiceGalleryView: View {
    let state: String
    @State private var sent: String?

    var body: some View {
        ZStack(alignment: .top) {
            VoiceListeningView(voice: Self.voice(state), sendText: { sent = $0 }, close: {})
            if let sent {
                Text(sent).font(.footnote).foregroundStyle(.white).padding(.top, 6).accessibilityIdentifier("voice-sent")
            }
        }
    }

    private static func voice(_ state: String) -> StaticVoice {
        switch state {
        case "text":
            return StaticVoice(transcript: "Tìm giúp mình quán cà phê yên tĩnh ở Đà Lạt", isListening: true, error: nil)
        case "error":
            return StaticVoice(transcript: "", isListening: false, error: NSLocalizedString("voice.error.micPermission", comment: ""))
        default:
            return StaticVoice(transcript: "", isListening: true, error: nil)
        }
    }
}
#endif
