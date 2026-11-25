import SwiftUI
import UIKit

/// Where the composer's «+» menu sends the person for an attachment.
enum ChatAttachSource { case camera, photo, file }

/// The camera, for «Chụp ảnh» in the chat composer (owner UAT: only a PDF could be attached; no camera). The photo goes
/// through the same path as a library photo (`AttachmentPreparer.prepareJPEG`), so a large photo is brought within the
/// server's bounds and its location data is not sent. `NSCameraUsageDescription` is already in Info.plist.
struct CameraPicker: UIViewControllerRepresentable {
    /// The photo taken, or nil when the person cancelled.
    let onFinish: (UIImage?) -> Void

    /// False on the Simulator and on a device with no camera: the menu hides «Chụp ảnh» then.
    static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = ["public.image"]
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onFinish: (UIImage?) -> Void
        init(onFinish: @escaping (UIImage?) -> Void) { self.onFinish = onFinish }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onFinish(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onFinish(nil) }
    }
}
