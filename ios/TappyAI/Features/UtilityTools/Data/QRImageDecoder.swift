import Foundation
import UIKit
import Vision

/// Reads QR codes out of a picture ON THE PHONE (Vision). The picture is never uploaded and never kept: only the
/// decoded text leaves this type, and the caller decides what to do with it.
enum QRImageDecoder {
    /// The decoded texts of every QR code in the picture, in reading order (empty if there is none).
    static func decode(_ image: UIImage) -> [String] {
        guard let cg = image.cgImage else { return [] }
        return decode(cgImage: cg, orientation: CGImagePropertyOrientation(image.imageOrientation))
    }

    static func decode(cgImage: CGImage, orientation: CGImagePropertyOrientation = .up) -> [String] {
        let request = VNDetectBarcodesRequest()
        request.symbologies = [.qr]
        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
        var found: [String] = []
        if (try? handler.perform([request])) != nil {
            found = (request.results ?? []).compactMap { $0.payloadStringValue }.filter { !$0.isEmpty }
        }
        // Core Image's detector is the second reader: it works where Vision's barcode request does not (and reads
        // some codes Vision misses). Same rule: the picture stays here, only text leaves.
        if found.isEmpty, let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: nil,
                                                    options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]) {
            let ci = CIImage(cgImage: cgImage)
            found = detector.features(in: ci).compactMap { ($0 as? CIQRCodeFeature)?.messageString }.filter { !$0.isEmpty }
        }
        return found.map { String($0.prefix(4_000)) }
    }

    /// A QR picture made on the phone (for tests and the fixture screens): never a network call.
    static func makeImage(_ text: String, scale: CGFloat = 8) -> UIImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(Data(text.utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: scale, y: scale)) else { return nil }
        let context = CIContext()
        guard let cg = context.createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
