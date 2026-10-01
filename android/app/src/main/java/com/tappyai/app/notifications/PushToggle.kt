package com.tappyai.app.notifications

/**
 * The Notifications switch, OFF direction (01/10). Before: only the local preference was written, so the server kept
 * sending to this device (the app merely dropped the message). Now OFF is real only once the server has it off.
 *
 * Pure so it is unit-tested without Android: [unregister] is the repository call (true = the server now has it off).
 */
sealed interface PushToggleResult {
    /** The server has it off — write the preference OFF and show the switch OFF. */
    data object Off : PushToggleResult

    /** The server call failed — keep the switch ON, keep the preference, tell the person it did NOT turn off. */
    data object NotOff : PushToggleResult
}

suspend fun turnPushOff(token: String?, unregister: suspend (String?) -> Boolean): PushToggleResult =
    if (unregister(token)) PushToggleResult.Off else PushToggleResult.NotOff
