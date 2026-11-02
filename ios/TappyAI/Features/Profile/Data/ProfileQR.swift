import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

/// The profile QR — the iOS counterpart of the web's `/profile/qr` (`QRProfileView.tsx`).
///
/// It encodes the public profile URL and nothing else: `/users/<id>` on the canonical origin,
/// the page the web already serves to anyone (and which is on production). The old share button
/// sent `https://tappyai.vn/users/…`, a non-canonical host.
enum ProfileQR {
    /// The canonical public profile URL, or nil when there is no signed-in user id.
    static func profileURL(userId: String?) -> URL? {
        let id = userId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !id.isEmpty,
              let escaped = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              !escaped.contains("/")
        else { return nil }
        return URL(string: "\(TappyShare.canonicalOrigin)/users/\(escaped)")
    }

    /// A QR code for `text`, drawn with CoreImage and scaled without smoothing so the modules stay
    /// sharp. Medium error correction, like the web code. Nil if CoreImage produces nothing.
    static func image(for text: String, scale: CGFloat = 10) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cgImage = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
