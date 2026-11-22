import Foundation

/// A stay card's reference-price line (web `src/lib/recommendation/stayOffer.ts`, owner 19/11/2026): the price the provider's realtime check
/// returned for THIS hotel, with the platform and the time of the check. The numbers are only the provider's structured fields; nothing here
/// computes or guesses a price. The server puts it in the place of the live `tappy.places.v1` annotation (`stayOffer`).
struct LiveStayOffer: Equatable, Sendable {
    let platform: String
    let amount: Double
    /// `VND` or `USD`.
    let currency: String
    /// `per_night` or `total`.
    let unit: String
    let nights: Int?
    let guests: Int?
    /// ISO-8601 time of the check.
    let checkedAt: String
}

/// The offer as the annotation carries it, read like the web's `readStayOffer`: every field the line needs must be a real value, otherwise there
/// is no offer. It never throws, so a malformed offer cannot make the whole place (and its card) disappear.
struct LenientStayOffer: Codable, Equatable, Sendable {
    let offer: LiveStayOffer?

    init(offer: LiveStayOffer?) { self.offer = offer }

    private enum Keys: String, CodingKey { case platform, amount, currency, unit, nights, guests, checkedAt }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: Keys.self) else { offer = nil; return }
        func string(_ k: Keys) -> String? { (try? c.decodeIfPresent(String.self, forKey: k)) ?? nil }
        func number(_ k: Keys) -> Double? { (try? c.decodeIfPresent(Double.self, forKey: k)) ?? nil }
        func whole(_ k: Keys) -> Int? {
            guard let n = (try? c.decodeIfPresent(Int.self, forKey: k)) ?? nil, (1...30).contains(n) else { return nil }
            return n
        }
        guard let amount = number(.amount), amount.isFinite, amount > 0,
              let currency = string(.currency), currency == "VND" || currency == "USD",
              let unit = string(.unit), unit == "per_night" || unit == "total",
              let platform = string(.platform)?.trimmingCharacters(in: .whitespacesAndNewlines), !platform.isEmpty,
              let checkedAt = string(.checkedAt), StayOfferLine.parse(checkedAt) != nil
        else { offer = nil; return }
        offer = LiveStayOffer(platform: platform, amount: amount, currency: currency, unit: unit,
                              nights: whole(.nights), guests: whole(.guests), checkedAt: checkedAt)
    }

    func encode(to encoder: Encoder) throws {
        guard let offer else { return }
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(offer.platform, forKey: .platform)
        try c.encode(offer.amount, forKey: .amount)
        try c.encode(offer.currency, forKey: .currency)
        try c.encode(offer.unit, forKey: .unit)
        try c.encodeIfPresent(offer.nights, forKey: .nights)
        try c.encodeIfPresent(offer.guests, forKey: .guests)
        try c.encode(offer.checkedAt, forKey: .checkedAt)
    }
}

enum StayOfferLine {
    /// The one reference-price line ("Giá tham khảo: 1.200.000đ/đêm cho 2 người, chưa gồm thuế và phí; Agoda kiểm tra lúc 09:30 ngày 20/11/2026. ..."),
    /// or nil when the time of the check cannot be read. `lang` is `vi` or `en`.
    static func text(_ o: LiveStayOffer, lang: String) -> String? {
        guard let date = parse(o.checkedAt) else { return nil }
        let (time, day) = checkParts(date)
        let key = o.unit == "per_night" ? "place.stayPriceNight" : "place.stayPriceTotal"
        let guests = o.guests.map { NSLocalizedString("place.stayGuests", comment: "").replacingOccurrences(of: "{n}", with: String($0)) } ?? ""
        return NSLocalizedString(key, comment: "")
            .replacingOccurrences(of: "{price}", with: money(o, lang: lang))
            .replacingOccurrences(of: "{guests}", with: guests)
            .replacingOccurrences(of: "{platform}", with: o.platform)
            .replacingOccurrences(of: "{time}", with: time)
            .replacingOccurrences(of: "{date}", with: day)
    }

    /// "1.200.000đ" (vi) or "1,200,000 VND" (en); a USD price is "120 USD". Never a computed figure: the amount is the provider's.
    static func money(_ o: LiveStayOffer, lang: String) -> String {
        if o.currency == "USD" {
            return (o.amount == o.amount.rounded() ? String(Int(o.amount)) : String(o.amount)) + " USD"
        }
        let n = Int(o.amount.rounded())
        return lang == "vi" ? grouped(n, separator: ".") + "đ" : grouped(n, separator: ",") + " VND"
    }

    static func grouped(_ n: Int, separator: String) -> String {
        let digits = Array(String(abs(n)))
        var out = ""
        for (i, ch) in digits.enumerated() {
            if i > 0, (digits.count - i) % 3 == 0 { out += separator }
            out.append(ch)
        }
        return (n < 0 ? "-" : "") + out
    }

    /// The time of the check as a `Date`, with or without fractional seconds.
    static func parse(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: iso) { return d }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: iso)
    }

    /// `HH:mm` and `dd/MM/yyyy` of the check in Vietnam time (the stay's own clock).
    static func checkParts(_ date: Date) -> (time: String, date: String) {
        func format(_ pattern: String) -> String {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")
            f.dateFormat = pattern
            return f.string(from: date)
        }
        return (format("HH:mm"), format("dd/MM/yyyy"))
    }
}
