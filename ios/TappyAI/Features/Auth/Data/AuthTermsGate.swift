import Foundation

/// App Review 1.2: the person agrees to the Terms (which forbid objectionable content and abusive users)
/// BEFORE registering or logging in, whichever provider they use.
///
/// Pure decision, shared by the login and registration view models so no sign-in path can forget it.
/// An agreement is recorded with the same device-local, versioned record the posting gate reads
/// (`TermsConsent`): there is no server field for it, so agreeing here also satisfies the posting gate.
/// A person already signed in from an earlier build has no record and is asked before their first
/// review or comment, exactly as before.
struct AuthTermsGate {
    /// Whether the checkbox starts ticked: only when this device already holds an agreement to the CURRENT terms version.
    static func initiallyAgreed(consent: TermsConsent = TermsConsent()) -> Bool { consent.hasAccepted }

    /// True when the sign-in / registration may proceed. Records the agreement; a refusal records nothing.
    static func allow(agreed: Bool, consent: TermsConsent = TermsConsent()) -> Bool {
        guard agreed else { return false }
        consent.accept()
        return true
    }
}
