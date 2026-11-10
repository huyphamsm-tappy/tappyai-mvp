import Foundation

/// Sends the clip FILE to the storage session URL the server gave (contract §2 step 2).
///
///  - the body is streamed from the file (never held in memory as a whole), with progress;
///  - the HTTP status IS checked (the legacy path ignored it; the server still verifies the object at /complete);
///  - NO Authorization header and no cookies: the session URL carries its own permission and belongs to another host.
enum VideoFileUploader {
    /// Pure: the request for the PUT. Tested without a network.
    static func makeRequest(to url: URL, contentType: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 600
        request.httpShouldHandleCookies = false
        return request
    }

    /// Pure: the storage answers 200/201 when the object is whole. Anything else is a failed upload.
    static func isSuccess(status: Int) -> Bool { status == 200 || status == 201 }

    static func put(fileURL: URL, to url: URL, contentType: String, progress: @escaping (Double) -> Void) async throws {
        let request = makeRequest(to: url, contentType: contentType)
        let delegate = ProgressDelegate(progress)
        let response: URLResponse
        do {
            (_, response) = try await URLSession.shared.upload(for: request, fromFile: fileURL, delegate: delegate)
        } catch {
            throw URLSessionAPIClient.mapTransport(error)
        }
        guard let http = response as? HTTPURLResponse, isSuccess(status: http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode
            throw AppError.network(status: status, code: "upload_put_failed")
        }
        progress(1.0)
    }

    private final class ProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        private let handler: (Double) -> Void

        init(_ handler: @escaping (Double) -> Void) {
            self.handler = handler
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                        totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
            guard totalBytesExpectedToSend > 0 else { return }
            handler(min(1.0, Double(totalBytesSent) / Double(totalBytesExpectedToSend)))
        }
    }
}
