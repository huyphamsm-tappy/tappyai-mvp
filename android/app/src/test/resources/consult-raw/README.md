# Consult V2 raw `/api/chat` streams (offline render tests)

Captured by the web session on UAT with the ANDROID request shape (`x-tappy-surface: android`,
`x-tappy-caps: ask` except `r10-no-caps`), from the private bucket
`gs://tappyai-uat-evidence/evidence/{9644d8e/android-requests,933a985/r15}/`. `a:` tool-result
payloads are trimmed (clients ignore them); every other frame is byte-for-byte. Dropped: two empty
captures, one `free_limit_reached` error body and four double-encoded (mojibake) captures.
Used by `ConsultV2RawReplayTest`.
