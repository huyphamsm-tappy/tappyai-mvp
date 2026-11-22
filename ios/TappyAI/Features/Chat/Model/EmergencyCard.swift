import Foundation

/// The web's emergency card (`src/lib/safety/emergencyResponse.ts`): when a message says someone is in danger, the server answers with the
/// hotlines in the TEXT (so the numbers are always readable) and sends the same hotlines as an annotation of kind `tappy.safety.v1`, which
/// the web draws as a card with a call button for each. The server never asks a model for these numbers: they come from its verified registry.
let safetyAnnotationKind = "tappy.safety.v1"

/// One hotline of the card: a short emergency number the person can call with one tap.
struct EmergencyCardItem: Equatable, Sendable, Identifiable {
    let displayName: String
    /// 2 to 4 digits (111, 113, 115, 1900…), as the web's reader requires.
    let phoneNumber: String
    let operatingHours: String?
    let freeOfCharge: Bool

    var id: String { phoneNumber + "|" + displayName }

    /// The `tel:` address that dials this hotline.
    var telURL: URL? { URL(string: "tel:" + phoneNumber) }
}

enum EmergencyFrames {
    /// The most hotlines one card shows (the web's longest set is three: a child or trafficking case adds the police number).
    static let maxCards = 6

    /// The cards of one `tappy.safety.v1` annotation, re-checked like the web's `readSafetyAnnotation`: a card without a 2-4 digit number or a
    /// name is dropped; an annotation with nothing usable gives an empty list (no frame). Phone numbers are digits only, so nothing a model or a
    /// page wrote can become a dial string.
    static func cards(_ o: [String: Any]) -> [EmergencyCardItem] {
        guard (o["kind"] as? String) == safetyAnnotationKind, let raw = o["cards"] as? [Any] else { return [] }
        var out: [EmergencyCardItem] = []
        for element in raw {
            guard let card = element as? [String: Any],
                  let number = card["phoneNumber"] as? String, isShortNumber(number),
                  let name = (card["displayName"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty
            else { continue }
            let hours = (card["operatingHours"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            out.append(EmergencyCardItem(displayName: String(name.prefix(120)),
                                         phoneNumber: number,
                                         operatingHours: (hours?.isEmpty ?? true) ? nil : String(hours!.prefix(80)),
                                         freeOfCharge: (card["freeOfCharge"] as? Bool) == true))
            if out.count == maxCards { break }
        }
        return out
    }

    /// `^\d{2,4}$`, ASCII digits only.
    static func isShortNumber(_ s: String) -> Bool {
        (2...4).contains(s.count) && s.utf8.allSatisfy { $0 >= 0x30 && $0 <= 0x39 }
    }
}
