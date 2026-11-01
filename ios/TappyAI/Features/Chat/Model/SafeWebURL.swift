import Foundation

/// The one door for an address the SERVER (or the model) wrote and the app is about to open or load: http or https with a host, and
/// never a page of another AI product (`AiSourcePolicy`). Anything else — `tel:`, `sms:`, `itms-apps:`, `javascript:`, `file:`,
/// `intent:`, a bare path — is nil, so a stored or forged link cannot make a tap do more than open a web page. Port of Android
/// `isOpenableLink`. Review 02/11 (iOS): markdown links, place cards, the seller line, media blocks and plan links opened whatever
/// scheme they carried.
func safeWebURL(_ s: String) -> URL? {
    let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
          let url = URL(string: trimmed),
          let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
          let host = url.host, !host.isEmpty,
          !AiSourcePolicy.isAiProductSource(trimmed)
    else { return nil }
    return url
}
