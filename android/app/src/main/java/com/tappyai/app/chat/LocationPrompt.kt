package com.tappyai.app.chat

import android.content.Context

/**
 * When the chat may show the location permission prompt (UAT3, 2026-09-27).
 *
 * Measured on a Galaxy A12: the prompt came back on EVERY place turn after "Không cho phép" — the
 * old `askLocationOnce` was only "once" per call, nothing remembered it — and a message typed while
 * the system dialog covered the screen never reached the composer.
 *
 * The rules:
 *  - a SEND asks at most once per install; after any answer it never asks again;
 *  - the 📍 "Tìm quanh đây" chip is the person asking for location — it asks every time the
 *    permission is missing (Android itself stops showing the dialog after "don't ask again");
 *  - with no location the turn still goes out: the server's gate asks for the area in the chat or
 *    uses a remembered one (actionability.ts), so a refusal never blocks a turn.
 * Where a prompt IS shown, the send waits for it to close (ChatScreen) — the composer keeps its text
 * and the message goes out afterwards, whatever the answer.
 */
internal object LocationPrompt {
    private const val PREFS = "tappy_location_prompt"
    private const val KEY_ASKED_ON_SEND = "asked_on_send"

    /** Pure decision, unit-tested: ask before this action? */
    fun shouldAsk(hasPermission: Boolean, explicit: Boolean, askedBefore: Boolean): Boolean =
        !hasPermission && (explicit || !askedBefore)

    fun askedBefore(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ASKED_ON_SEND, false)

    fun markAsked(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ASKED_ON_SEND, true).apply()
    }
}
