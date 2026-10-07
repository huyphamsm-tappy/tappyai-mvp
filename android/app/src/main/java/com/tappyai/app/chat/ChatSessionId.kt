package com.tappyai.app.chat

import android.content.Context
import java.util.UUID

/**
 * The chat's `chatSessionId` (ANDROID-REQUESTS R14, contract fixed by the web session 29/09 —
 * owner decision Q7: consultation on the app must be on par with web, with the state kept SERVER-side
 * under ADR-024). A UUID v4, made once when a NEW chat opens and sent unchanged on EVERY turn of it —
 * first turn and guests included. A chat reopened from history reuses the id stored with it; an old
 * chat that never had one gets a fresh id (the server rebuilds its state from the messages).
 */
object ChatSessionId {
    /** SavedStateHandle key: the id survives the process being killed while the chat is open. */
    const val SAVED_KEY = "chatSessionId"
    private val UUID_RE = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

    fun isValid(id: String?): Boolean = id != null && UUID_RE.matches(id)

    /**
     * [saved] = this chat's id from the saved state; [historyRowId] = the reopened chat's history row;
     * [stored] = the id kept with that row on this device.
     */
    fun resolve(
        saved: String?,
        historyRowId: String?,
        stored: (String) -> String?,
        newId: () -> String = { UUID.randomUUID().toString() },
    ): String = saved?.takeIf(::isValid)
        ?: historyRowId?.let(stored)?.takeIf(::isValid)
        ?: newId()
}

/** The id kept with each saved chat on this device (history row id → chatSessionId). */
class ChatSessionIdStore(context: Context) {
    private val prefs = context.getSharedPreferences("chat_session_ids", Context.MODE_PRIVATE)
    fun get(historyRowId: String): String? = prefs.getString(historyRowId, null)
    fun put(historyRowId: String, id: String) { prefs.edit().putString(historyRowId, id).apply() }
}
