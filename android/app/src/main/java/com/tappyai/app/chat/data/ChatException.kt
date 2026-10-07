package com.tappyai.app.chat.data

/** Chat-API-specific errors, mapped from HTTP status codes and error body payloads. */
sealed class ChatException(message: String) : Exception(message) {
    /** HTTP 429 from the per-minute IP rate limiter. */
    class RateLimited(message: String) : ChatException(message)
    /** HTTP 429 with `error: "free_limit_reached"` — authenticated free-tier daily cap hit. */
    class DailyLimitReached(message: String) : ChatException(message)
    /** HTTP 401 with `error: "anon_limit_reached"` — anonymous daily question cap hit. */
    class AnonLimitReached(message: String) : ChatException(message)
    /** 401 `auth_required` — the server refuses Chat to a visitor without an account. */
    class AuthRequired(message: String) : ChatException(message)
    /**
     * 403 `age_declaration_required` — a GUEST must first declare 18+ on this device (owner
     * decision D1 revised). The chat renders the declaration step, not an error line.
     */
    class AgeDeclarationRequired(message: String) : ChatException(message)
    /** 403 `age_ineligible` / `age_verification_required` — the 18+ gate refused this identity (main #251). */
    class AgeGate(val code: String, message: String) : ChatException(message)
    /** HTTP 413 — message payload too large. */
    class MessageTooLong(message: String) : ChatException(message)
    /** HTTP 502 with `error: "ai_error"` — upstream AI provider failure. */
    class AiError(message: String) : ChatException(message)
    /** Any other non-2xx response. */
    class ServerError(val code: Int, message: String) : ChatException(message)
}
