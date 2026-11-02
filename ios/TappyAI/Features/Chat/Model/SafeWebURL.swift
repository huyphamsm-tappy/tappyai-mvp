import Foundation

/// The one door for an address the SERVER (or the model) wrote and the app is about to open or load: http or https with a host, and
/// never a page of another AI product (`AiSourcePolicy`). Anything else — `tel:`, `sms:`, `itms-apps:`, `javascript:`, `file:`,
/// `intent:`, a bare path — is nil, so a stored or forged link cannot make a tap do more than open a web page. Port of Android
/// `isOpenableLink`. Review 02/11 (iOS): markdown links, place cards, the seller line, media blocks and plan links opened whatever
/// scheme they carried.
func safeWebURL(_ s: String) -> URL? {
    let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
    let lower = trimmed.lowercased()
    let isHttps = lower.hasPrefix("https://")
    guard isHttps || lower.hasPrefix("http://"),
          !AiSourcePolicy.isAiProductSource(trimmed),
          // The host door of the web's `isSafeHttpsUrl`: no credentials (`apple.com@evil.com`), no private or internal address.
          OneBrainFrames.isSafeHttpsUrl("https://" + trimmed.dropFirst(isHttps ? 8 : 7))
    else { return nil }
    if let url = URL(string: trimmed), let host = url.host, !host.isEmpty { return url }
    // iOS 16's `URL(string:)` refuses accented letters (a Vietnamese Wikipedia title): percent-encode what is not allowed, keep what is.
    var allowed = CharacterSet.urlQueryAllowed
    allowed.insert(charactersIn: "#%[]")
    guard let encoded = trimmed.addingPercentEncoding(withAllowedCharacters: allowed),
          let url = URL(string: encoded), let host = url.host, !host.isEmpty
    else { return nil }
    return url
}
