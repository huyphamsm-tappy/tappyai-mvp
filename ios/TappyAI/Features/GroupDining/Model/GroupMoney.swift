import Foundation

/// Whole-dong amounts of a shared bill, written the Vietnamese way (`1.250.000 ₫`) and read back
/// from what a person types.
enum GroupMoney {
    /// The web's cap (`MAX_BILL_VND`); the server refuses anything above it.
    static let maxVnd = 1_000_000_000

    static func text(_ vnd: Int) -> String {
        let digits = String(abs(vnd))
        var out = ""
        for (i, ch) in digits.reversed().enumerated() {
            if i > 0 && i % 3 == 0 { out.append(".") }
            out.append(ch)
        }
        return (vnd < 0 ? "-" : "") + String(out.reversed()) + " ₫"
    }

    /// The amount a person typed (`1.250.000`, `1 250 000`, `1250000`), or nil when it is empty or
    /// above the cap. Anything that is not a digit is ignored, so a pasted `đ` or a dot is fine.
    static func parse(_ typed: String) -> Int? {
        let digits = typed.filter { $0.isASCII && $0.isNumber }
        guard !digits.isEmpty, digits.count <= 10, let n = Int(digits), n <= maxVnd else { return nil }
        return n
    }
}
