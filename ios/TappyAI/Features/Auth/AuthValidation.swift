import Foundation

/// Pure, client-side **input** validation only (matches Web's client checks — survey §1.5/§1.6).
/// This is UX convenience, NOT a product rule: the backend remains authoritative (Thin Client).
enum AuthValidation {
    static func isValidEmail(_ s: String) -> Bool { s.contains("@") && s.contains(".") }
    static func isValidOTP(_ s: String) -> Bool { s.count == 6 && s.allSatisfy(\.isNumber) }
    static func isValidPassword(_ s: String) -> Bool { s.count >= 6 }
    static func isNonEmptyName(_ s: String) -> Bool { !s.trimmingCharacters(in: .whitespaces).isEmpty }
}
