# App Review 1.2 — Terms agreement before sign-in (branch note)

Build 144 (source `8009f07`) was rejected under Guideline 1.2 (and 2.3.6, which is an App Store Connect metadata change).

This branch adds a required agreement to the Terms of Service and Community Guidelines on the login screen and on registration,
for every sign-in method (password, email code, Google, Zalo, Apple). Code: `Features/Auth/Data/AuthTermsGate.swift`,
`Features/Auth/UI/AuthTermsConsentView.swift`; tests: `TappyAITests/AuthTermsGateTests.swift`.

Not covered here (owner / backend, see the audit): production safety flags and migrations, a named moderation operator and the
24-hour procedure, the device recording, and the Age Rating "Messaging and Chat" setting.

This file exists so a push touches `ios/**` and the iOS workflow runs the UI tests ( [shots] ). It can be deleted before merge.
