import Foundation

// MARK: - 18+ gate for chat
//
// iOS side of the contract `/api/chat` enforces before any model call
// (`src/app/api/chat/route.ts`, `src/lib/account/guestAgeDeclaration.ts`,
// `src/lib/account/ageEligibility.ts` on rc/web-uat). Same behaviour as Android
// (`GuestAgeStore.kt`, `RealChatRepository.chatErrorFor`) and web (`AgeCheckView.tsx`):
//
//  • Guest (no session, or an anonymous one): the declaration rides on every chat request as
//    `x-tappy-age-declared: 18plus | YYYY | YYYY-MM-DD`. Missing/unknown → 403
//    `age_declaration_required`; under 18 → 403 `age_ineligible`.
//  • Account: the date of birth lives server-side (`PATCH /api/profile {"dateOfBirth":"YYYY-MM-DD"}`).
//    None on file → 403 `age_verification_required`; under 18 → 403 `age_ineligible`.
//
// The client never decides eligibility itself: it only sends what the user stated and shows what
// the server answered. An under-18 answer is stored like any other, so the server keeps refusing.

/// The `error` codes `/api/chat` answers a 403 with when the age gate refuses.
enum AgeGateCode: String, Sendable, CaseIterable {
    /// Guest without a usable declaration.
    case declarationRequired = "age_declaration_required"
    /// Signed-in user with no date of birth on file.
    case verificationRequired = "age_verification_required"
    /// Under 18 — blocked.
    case ineligible = "age_ineligible"
}

/// The guest's self-declaration (`src/lib/account/guestAgeDeclaration.ts`).
enum GuestAgeDeclaration {
    /// Request header the route reads for guests (`GUEST_AGE_HEADER`).
    static let header = "x-tappy-age-declared"
    /// One-tap "I am 18 or older".
    static let adult = "18plus"
    /// UserDefaults key — same name as Android's preference.
    static let storageKey = "guest_age_declaration"
    static let minYear = 1900

    /// The header value for a typed birth year: a 4-digit year in 1900…current year, else nil.
    /// Whether that year is 18+ is the server's call — an under-18 year is still sent as stated.
    static func value(forBirthYear input: String, currentYear: Int = AgeGateCalendar.currentYear()) -> String? {
        let t = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.count == 4, t.allSatisfy(\.isASCII), let year = Int(t),
              (minYear...currentYear).contains(year) else { return nil }
        return t
    }
}

/// Persists the guest's declaration across launches.
struct GuestAgeStore {
    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    var declaration: String? {
        guard let v = defaults.string(forKey: GuestAgeDeclaration.storageKey), !v.isEmpty else { return nil }
        return v
    }

    func save(_ value: String) { defaults.set(value, forKey: GuestAgeDeclaration.storageKey) }
}

/// The date-of-birth form (`AgeCheckView.tsx`): day/month 1–2 digits, year 4 digits.
enum DateOfBirthInput {
    /// `YYYY-MM-DD` for a real calendar date from 1900-01-01 up to today (UTC), else nil —
    /// the same rule as the server's `parseDateOfBirthInput`, so an obviously bad date is caught
    /// before the round trip.
    static func iso(day: String, month: String, year: String, today: Date = Date()) -> String? {
        let d = day.trimmingCharacters(in: .whitespaces)
        let m = month.trimmingCharacters(in: .whitespaces)
        let y = year.trimmingCharacters(in: .whitespaces)
        guard (1...2).contains(d.count), (1...2).contains(m.count), y.count == 4,
              (d + m + y).allSatisfy({ $0.isASCII && $0.isNumber }),
              let dd = Int(d), let mm = Int(m), let yy = Int(y), yy >= GuestAgeDeclaration.minYear else { return nil }
        let cal = AgeGateCalendar.utc
        let comps = DateComponents(year: yy, month: mm, day: dd)
        guard comps.isValidDate(in: cal), let date = cal.date(from: comps),
              date <= today else { return nil }
        return String(format: "%04d-%02d-%02d", yy, mm, dd)
    }
}

/// `ageStatus` returned by `PATCH /api/profile` / `GET /api/profile`.
enum AgeStatus: String, Sendable {
    case eligible, ineligible, unknown
}

/// The age fields of `GET /api/profile` and of a successful `PATCH /api/profile` with a date of
/// birth: `{ ageStatus, canCorrectAge, … }`.
struct DateOfBirthUpdateResponse: Decodable, Sendable, Equatable {
    let ageStatus: String?
    let canCorrectAge: Bool?

    var status: AgeStatus { ageStatus.flatMap(AgeStatus.init(rawValue:)) ?? .unknown }
    /// Web `AgeCheckView` treats a missing `canCorrectAge` as true; the server still has the last word (409).
    var mayCorrect: Bool { canCorrectAge ?? true }
}

/// What the chat does after an account saves (or corrects) its date of birth — the same branches
/// as web `AgeCheckView.submit`.
enum AgeCorrectionOutcome: Equatable, Sendable {
    /// Now eligible: resend the refused turn.
    case resend
    /// Still under 18: the blocked state, with whether another correction is allowed.
    case blocked(canCorrect: Bool)
    /// 409 `age_correction_exhausted`: blocked, correction no longer offered, support shown.
    case correctionExhausted
    /// Anything else: keep the form open with this sentence.
    case formError(String)

    static func from(_ result: Result<DateOfBirthUpdateResponse, Error>) -> AgeCorrectionOutcome {
        switch result {
        case .success(let r):
            switch r.status {
            case .eligible: return .resend
            case .ineligible: return .blocked(canCorrect: r.mayCorrect)
            case .unknown: return .formError(NSLocalizedString("chat.age.error.failed", comment: ""))
            }
        case .failure(let error):
            if case .network(_, let code?)? = error as? AppError, code == "age_correction_exhausted" {
                return .correctionExhausted
            }
            if case .validation(let message)? = error as? AppError {
                return .formError(message)   // the server's localized `age.invalidDate`
            }
            return .formError(NSLocalizedString("chat.age.error.failed", comment: ""))
        }
    }
}

/// Where a blocked account can ask for help once its correction is used (web `AgeCheckView`).
enum AgeGateSupport {
    static let email = "support@tappyai.com"
}

enum AgeGateCalendar {
    /// The server computes ages in UTC.
    static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    static func currentYear(now: Date = Date()) -> Int { utc.component(.year, from: now) }
}
