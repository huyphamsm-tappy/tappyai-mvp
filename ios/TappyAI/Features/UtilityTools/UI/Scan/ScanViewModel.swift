import SwiftUI
import PhotosUI

@MainActor
final class ScanViewModel: AppObservableObject {
    @AppPublished var selectedImage: UIImage?
    @AppPublished var extractedText = ""
    @AppPublished var loading = false
    @AppPublished var error: String?

    private let service: UtilityToolsService
    private let maxDimension: CGFloat = 2048

    init(service: UtilityToolsService) {
        self.service = service
    }

    var hasImage: Bool { selectedImage != nil }
    var hasResult: Bool { !extractedText.isEmpty }
    /// Web keeps the scan button under the preview for as long as an image is selected (also after a result, so the user can scan again);
    /// while a scan runs it is disabled and shows the spinner with `scan.scanning`.
    var showsScanButton: Bool { hasImage }
    var canScan: Bool { hasImage && !loading }

    func setImage(_ image: UIImage) {
        selectedImage = image
        extractedText = ""
        error = nil
    }

    func scan() async {
        guard let image = selectedImage else { return }
        loading = true
        error = nil
        extractedText = ""

        guard let resized = resizeImage(image),
              let data = resized.jpegData(compressionQuality: 0.8) else {
            error = NSLocalizedString("scan.error.image", comment: "")
            loading = false
            return
        }

        let base64 = data.base64EncodedString()
        let mimeType = "image/jpeg"

        do {
            let response = try await service.scan(imageBase64: base64, mimeType: mimeType)
            extractedText = response.text
        } catch let appError as AppError {
            switch appError {
            case .authentication(reason: .anonLimitReached), .authentication(reason: .freeLimitReached):
                error = NSLocalizedString("scan.error.dailyLimit", comment: "")
            default:
                error = NSLocalizedString("scan.error.recognize", comment: "")
            }
        } catch {
            self.error = NSLocalizedString("scan.error.recognize", comment: "")
        }
        loading = false
    }

    func clear() {
        selectedImage = nil
        extractedText = ""
        error = nil
    }

    private func resizeImage(_ image: UIImage) -> UIImage? {
        let size = image.size
        let maxDim = max(size.width, size.height)
        guard maxDim > maxDimension else { return image }
        let scale = maxDimension / maxDim
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
        image.draw(in: CGRect(origin: .zero, size: newSize))
        let resized = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        return resized
    }
}
