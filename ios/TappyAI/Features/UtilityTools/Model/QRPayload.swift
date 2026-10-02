import Foundation

/// What a scanned QR code CONTAINS — decided on the phone from the decoded text only.
///
/// 🚨 The app never acts on a code: a link goes to the link check (just the link, never the picture), everything
/// else is NAMED and WARNED about («do not open / do not pay just because a code says so»). Nothing here opens a
/// URL, dials, pays, joins a Wi-Fi or saves a contact.
enum QRPayload: Equatable, Sendable {
    case link(String)
    case wifi
    case contact
    case phone
    case sms
    case email
    /// Bank / wallet transfer codes (VietQR / EMVCo «000201…», `upi:`, `momo`, bank deep links).
    case payment
    case crypto
    case text(String)

    /// The i18n key of the plain name of the kind («Wi-Fi», «Thanh toán»…).
    var kindKey: String {
        switch self {
        case .link: return "scam.qr.kind.link"
        case .wifi: return "scam.qr.kind.wifi"
        case .contact: return "scam.qr.kind.contact"
        case .phone: return "scam.qr.kind.phone"
        case .sms: return "scam.qr.kind.sms"
        case .email: return "scam.qr.kind.email"
        case .payment: return "scam.qr.kind.payment"
        case .crypto: return "scam.qr.kind.crypto"
        case .text: return "scam.qr.kind.text"
        }
    }

    /// The warning for every kind that is NOT a link (a link gets the full link check instead).
    var warningKey: String {
        switch self {
        case .link: return "scam.qr.warn.link"
        case .wifi: return "scam.qr.warn.wifi"
        case .contact: return "scam.qr.warn.contact"
        case .phone: return "scam.qr.warn.phone"
        case .sms: return "scam.qr.warn.sms"
        case .email: return "scam.qr.warn.email"
        case .payment: return "scam.qr.warn.payment"
        case .crypto: return "scam.qr.warn.crypto"
        case .text: return "scam.qr.warn.text"
        }
    }

    static func classify(_ raw: String) -> QRPayload {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = s.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") { return .link(s) }
        if lower.hasPrefix("www.") { return .link("https://" + s) }
        if lower.hasPrefix("wifi:") { return .wifi }
        if lower.hasPrefix("begin:vcard") || lower.hasPrefix("mecard:") || lower.hasPrefix("begin:vcalendar") { return .contact }
        if lower.hasPrefix("tel:") { return .phone }
        if lower.hasPrefix("sms:") || lower.hasPrefix("smsto:") || lower.hasPrefix("mms:") { return .sms }
        if lower.hasPrefix("mailto:") || lower.hasPrefix("matmsg:") { return .email }
        if lower.hasPrefix("bitcoin:") || lower.hasPrefix("ethereum:") || lower.hasPrefix("litecoin:") || lower.hasPrefix("tron:") || lower.hasPrefix("solana:") { return .crypto }
        // EMVCo merchant-presented codes start with «000201» (VietQR, bank transfer); wallets use their own schemes.
        if s.hasPrefix("000201") || lower.hasPrefix("upi:") || lower.hasPrefix("momo:") || lower.hasPrefix("zalopay:") || lower.hasPrefix("vnpay:") { return .payment }
        // Anything else (including an app deep link `scheme://…`) is shown as text and never opened.
        return .text(s)
    }

    /// A short, safe-to-show form of the content (never the whole of a long payload).
    var preview: String {
        switch self {
        case .link(let s), .text(let s): return String(s.prefix(160))
        default: return ""
        }
    }
}
