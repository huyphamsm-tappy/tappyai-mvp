package com.tappyai.app.messaging.data

import java.io.File

/**
 * This device's own copy of the pictures it has shown (owner 04/11/2026: "like Zalo" — the server keeps a picture for 30 days, the device keeps its copy; the web does the
 * same in the browser's Cache Storage). A picture is saved into the app's private files folder the first time its signed link is shown, named by the MESSAGE id (never by the
 * link, which changes every hour). When the server no longer has the picture ([ChatMessageMedia.expired]) the screen asks for the copy instead.
 *
 * Plain files and no Android types, so the rules are tested on the JVM. Everything is best effort and silent: a full disk, a missing file or a message id that is not a plain id
 * simply means "no copy". The folder is emptied on sign-out ([clearAll]), so the next person on a shared phone inherits nothing.
 */
object ChatPhotoFiles {
    const val FOLDER = "chat_photos"
    /** Same ceiling as the upload limit plus a little: a larger answer is not one of our pictures. */
    const val MAX_COPY_BYTES = 6 * 1024 * 1024

    private val SAFE_ID = Regex("^[A-Za-z0-9-]{1,64}$")

    fun dir(filesDir: File): File = File(filesDir, FOLDER)

    private fun fileFor(filesDir: File, messageId: String): File? =
        if (SAFE_ID.matches(messageId)) File(dir(filesDir), "$messageId.img") else null

    fun has(filesDir: File, messageId: String): Boolean = fileFor(filesDir, messageId)?.isFile == true

    /** The saved copy, or null. */
    fun load(filesDir: File, messageId: String): File? = fileFor(filesDir, messageId)?.takeIf { it.isFile && it.length() > 0 }

    /** Saves [bytes] as the copy for [messageId]; false (and nothing saved) for an empty or oversized body, an unsafe id or a write failure. */
    fun save(filesDir: File, messageId: String, bytes: ByteArray): Boolean {
        if (bytes.isEmpty() || bytes.size > MAX_COPY_BYTES) return false
        val target = fileFor(filesDir, messageId) ?: return false
        return runCatching {
            val folder = dir(filesDir)
            if (!folder.isDirectory && !folder.mkdirs()) return false
            val tmp = File(folder, "$messageId.tmp")
            tmp.writeBytes(bytes)
            if (!tmp.renameTo(target)) { tmp.delete(); return false }
            true
        }.getOrDefault(false)
    }

    /** Removes every saved copy (sign-out). Never throws. */
    fun clearAll(filesDir: File) {
        runCatching { dir(filesDir).deleteRecursively() }
    }
}
