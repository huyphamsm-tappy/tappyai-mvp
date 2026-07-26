package com.tappyai.app.chat

/**
 * One tappable call-to-action button the AI can attach to a recommendation reply — mirrors the
 * web's `CTAButton` interface and `[CTA_BUTTONS]{"buttons":[...]}[/CTA_BUTTONS]` marker exactly
 * (`src/components/ChatInterface.tsx`'s `parseCTA`, `src/lib/ai/promptBuilder.ts`'s CTA block).
 * [type] is one of `maps`/`call`/`zalo`/`website`/`booking`/`search`/`internal_booking` — the
 * current prompt explicitly forbids the model from ever emitting `internal_booking` (it always
 * links directly to an external platform), so every button in practice opens externally; any
 * unexpected `internal_booking` degrades to the same external-open behavior rather than crashing.
 */
data class ChatCtaButton(
    val label: String,
    val type: String,
    val url: String,
    val primary: Boolean,
)
