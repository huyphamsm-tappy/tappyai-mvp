import SwiftUI
import UIKit

/// The picture of one message — the web's `MessagePhoto`. While the server still has it: its SHORT-LIVED signed link (https only), and this
/// device keeps its own copy the first time it is shown (`ChatPhotoFiles`). After the retention period (`media.expired`) or when no link could
/// be made: this device's copy if it has one, otherwise "expired" / "unavailable". Never a broken image. The size is reserved from the
/// server's measurement, so the list does not jump while it loads.
struct MessagePhotoView: View {
    let messageId: String
    let media: ChatMessageMedia

    @State private var copy: UIImage?

    private var link: URL? {
        guard let raw = media.url, raw.lowercased().hasPrefix("https://") else { return nil }
        return URL(string: raw)
    }

    private var ratio: CGFloat {
        guard let w = media.width, let h = media.height, w > 0, h > 0 else { return 4.0 / 3.0 }
        return min(2, max(0.5, CGFloat(w) / CGFloat(h)))
    }

    var body: some View {
        content
            .frame(maxWidth: 240)
            .task(id: messageId + (media.url ?? "")) { await refresh() }
    }

    @ViewBuilder
    private var content: some View {
        if let link {
            AsyncImage(url: link) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure:
                    placeholder(media.expired ? "msg.photo.expired" : "msg.photo.unavailable")
                default:
                    Rectangle().fill(TappyColor.surface)
                }
            }
            .aspectRatio(ratio, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityLabel(Text("msg.photo.alt"))
        } else if let copy {
            Image(uiImage: copy)
                .resizable()
                .scaledToFill()
                .aspectRatio(ratio, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel(Text("msg.photo.alt"))
        } else {
            placeholder(media.expired ? "msg.photo.expired" : "msg.photo.unavailable")
        }
    }

    private func placeholder(_ key: String) -> some View {
        Text(LocalizedStringKey(key))
            .font(TappyFont.footnote)
            .foregroundStyle(TappyColor.textSecondary)
            .accessibilityIdentifier("message-photo-missing")
    }

    private func refresh() async {
        if let link {
            await ChatPhotoSaver.saveCopy(messageId: messageId, link: link)
        } else if let url = ChatPhotoFiles.load(base: ChatPhotoFiles.defaultBase, messageId: messageId) {
            copy = UIImage(contentsOfFile: url.path)
        } else {
            copy = nil
        }
    }
}

/// Saves the picture behind a signed link as this device's copy. Best effort and silent: any failure just means "no copy". The link is a signed
/// storage URL — no credentials ride along.
enum ChatPhotoSaver {
    static func saveCopy(messageId: String, link: URL) async {
        let base = ChatPhotoFiles.defaultBase
        guard link.scheme?.lowercased() == "https", !ChatPhotoFiles.has(base: base, messageId: messageId) else { return }
        guard let (data, response) = try? await URLSession.shared.data(from: link),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              http.mimeType?.hasPrefix("image/") == true else { return }
        ChatPhotoFiles.save(base: base, messageId: messageId, data: data)
    }
}
