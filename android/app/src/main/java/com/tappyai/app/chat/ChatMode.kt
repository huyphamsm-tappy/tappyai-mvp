package com.tappyai.app.chat

/**
 * The answer mode the person picks (web parity, 02/11: the one-brain chat's five modes; the web's menu in ChatInterface.tsx).
 * [wire] is what `/api/chat` reads in `mode` (src/lib/ai/security/clientInput.ts readChatMode). The server decides what the turn
 * really runs as (a plan without the mode runs as Chat; Auto turns thinking on when the model asks for it) — the app only sends the choice.
 */
enum class ChatMode(val wire: String) {
    /** Tự động: Chat until the model decides the question needs thinking (the web's default). */
    Auto("auto"),
    /** Trả lời nhanh: the chat model, no thinking. */
    Chat("chat"),
    /** Tìm web: always looks the question up on the web. */
    Web("web"),
    /** Suy nghĩ: reasoning with tools. */
    Think("think"),
    /** Nghiên cứu sâu: plan, research branches, one report (a long turn, counted per month by plan). */
    Deep("deep");

    companion object {
        val Default = Auto
        fun fromWire(value: String?): ChatMode = entries.firstOrNull { it.wire == value } ?: Default
    }
}
