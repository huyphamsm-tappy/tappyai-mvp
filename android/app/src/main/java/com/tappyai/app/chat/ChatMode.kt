package com.tappyai.app.chat

import com.tappyai.app.membership.data.PlanAccess

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

    /** The composer menu's rule (web: `setChatMode(m => (m === key ? 'auto' : key))`): the mode in use, picked again, goes back to Auto. */
    fun picked(choice: ChatMode): ChatMode = if (this == choice) Auto else choice

    /** The mode once a question is sent: Deep Research is for that one question (web: `setChatMode(m => (m === 'deep' ? 'auto' : m))`). */
    fun afterSend(): ChatMode = if (this == Deep) Auto else this

    companion object {
        val Default = Auto
        /** What the "+" menu offers, in the web's order (Auto is the default and has no item: its chip's ✕ goes back to it). */
        val menu: List<ChatMode> = listOf(Chat, Web, Think, Deep)
        fun fromWire(value: String?): ChatMode = entries.firstOrNull { it.wire == value } ?: Default

        /**
         * The modes the "+" menu offers for this account (web src/lib/plans/tiers.ts, which the server enforces: a mode the tier lacks runs as Chat).
         * Free (a visitor, or no live plan) has Chat only, so no mode is offered; every paid tier has them all. [access] null = plans not on sale
         * or not known yet: the whole menu, never less.
         */
        fun menuFor(access: PlanAccess?): List<ChatMode> = when {
            access == null -> menu
            !access.signedIn || access.state != "ACTIVE" || access.planId == "free" -> emptyList()
            else -> menu
        }
    }
}
