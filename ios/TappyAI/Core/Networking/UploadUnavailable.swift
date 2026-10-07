import Foundation

/// The storage service itself is down / refusing this deployment (Web 8c25bec): the upload-session route answers 502
/// `{"error": "<message>", "code": "upload_unavailable"}` and `/api/profile` POST answers 503 `{"error": "upload_unavailable"}`.
/// A retry cannot succeed and nothing was saved, so the client says so instead of "upload failed, try again".
/// Tolerant by design: any other status/body (or a malformed one) is NOT this condition and keeps its current handling.
enum UploadUnavailable {
    static let code = "upload_unavailable"

    /// Pure classification of a failed HTTP response.
    static func matches(status: Int, data: Data) -> Bool {
        guard status == 502 || status == 503 else { return false }
        guard let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return false }
        return (obj["code"] as? String) == code || (obj["error"] as? String) == code
    }

    /// Classification of an error already mapped by `APIClient.mapHTTP` (which carries the code through).
    static func matches(_ error: Error) -> Bool {
        guard case let .network(status, code)? = error as? AppError else { return false }
        return (status == 502 || status == 503) && code == Self.code
    }
}
