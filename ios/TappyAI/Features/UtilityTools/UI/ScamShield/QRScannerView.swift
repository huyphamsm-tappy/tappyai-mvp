import AVFoundation
import SwiftUI
import UIKit

/// The camera, looking for a QR code. It decodes ON THE PHONE (AVFoundation) and hands back only the text: no
/// frame, no picture is stored or sent. It reads once, then the caller closes it.
struct QRScannerView: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> ScannerController {
        let controller = ScannerController()
        controller.onCode = onCode
        return controller
    }

    func updateUIViewController(_ uiViewController: ScannerController, context: Context) {}

    final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
        var onCode: ((String) -> Void)?
        private let session = AVCaptureSession()
        private var preview: AVCaptureVideoPreviewLayer?
        private var delivered = false

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device),
                  session.canAddInput(input) else { return }
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            view.layer.addSublayer(layer)
            preview = layer
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            preview?.frame = view.bounds
        }

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            delivered = false
            let running = session
            DispatchQueue.global(qos: .userInitiated).async { if !running.isRunning { running.startRunning() } }
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            let running = session
            DispatchQueue.global(qos: .userInitiated).async { if running.isRunning { running.stopRunning() } }
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard !delivered,
                  let code = objects.compactMap({ ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }).first,
                  !code.isEmpty else { return }
            delivered = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onCode?(String(code.prefix(4_000)))
        }
    }
}

/// The camera permission as the screen needs to talk about it.
enum QRCameraAccess: Equatable {
    case undetermined, allowed, denied, unavailable

    static func current() -> QRCameraAccess {
        if AVCaptureDevice.default(for: .video) == nil { return .unavailable }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return .allowed
        case .notDetermined: return .undetermined
        default: return .denied
        }
    }

    static func request() async -> QRCameraAccess {
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        return granted ? .allowed : .denied
    }
}
