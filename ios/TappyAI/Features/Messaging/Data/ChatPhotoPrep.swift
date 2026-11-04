import UIKit

/// Gets a picked picture into what the server accepts: JPEG (the server re-encodes it without metadata), at most `ChatLimits.maxPhotoBytes`,
/// the longest side kept to `ChatLimits.maxPhotoSide`. Every picked photo is re-encoded here (as the avatar upload does): a phone-camera
/// original (HEIC, 12 MP) becomes a normal JPEG instead of being refused as "too big", and the orientation is baked in.
enum ChatPhotoPrep {
    struct Prepared {
        let jpeg: Data
        let preview: UIImage
    }

    /// The scale that brings the longest side down to `maxSide` (never above 1). Pure.
    static func scale(forLongestSide longest: CGFloat, maxSide: CGFloat = ChatLimits.maxPhotoSide) -> CGFloat {
        guard longest > 0, longest > maxSide else { return 1 }
        return maxSide / longest
    }

    /// nil when the data is not an image at all, or cannot be brought under the size limit.
    static func prepare(_ raw: Data) -> Prepared? {
        guard let image = UIImage(data: raw), image.size.width > 0, image.size.height > 0 else { return nil }
        let s = scale(forLongestSide: max(image.size.width, image.size.height))
        let target = CGSize(width: (image.size.width * s).rounded(), height: (image.size.height * s).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let scaled = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        var quality: CGFloat = 0.85
        while quality >= 0.3 {
            if let data = scaled.jpegData(compressionQuality: quality), data.count <= ChatLimits.maxPhotoBytes {
                return Prepared(jpeg: data, preview: scaled)
            }
            quality -= 0.15
        }
        return nil
    }
}
