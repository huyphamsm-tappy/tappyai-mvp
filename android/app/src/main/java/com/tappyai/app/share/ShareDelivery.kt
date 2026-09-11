package com.tappyai.app.share

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/**
 * One delivery adapter per target. Every function returns a [Result] naming what
 * ACTUALLY happened, so the sheet's toast can be truthful.
 *
 * Nothing here reports "sent": an app opening with the text pre-filled is an
 * OPEN; the user finishes it. The only delivery this client can confirm is the
 * clipboard and a file write, and those are the only two results phrased as done.
 */
object ShareDelivery {

    sealed class Result {
        /** The named app opened with the brochure text (and image when supplied). */
        data class OpenedApp(val target: TappyShare.Target) : Result()
        /** The app is not installed; the brochure was copied instead. */
        data class NotInstalledCopied(val target: TappyShare.Target) : Result()
        /** A share dialog opened with the BRAND url; the brochure was copied first. */
        data class CopiedAndOpenedDialog(val target: TappyShare.Target) : Result()
        data class OpenedEmail(val ok: Boolean) : Result()
        data object Copied : Result()
        data object CopyFailed : Result()
        data class Saved(val image: Boolean, val uri: Uri?) : Result()
        data object SaveFailed : Result()
        data object OpenedInbox : Result()
        data object OpenedSystemSheet : Result()
    }

    fun copy(context: Context, text: String, label: String = "TappyAI"): Result {
        return try {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText(label, text))
            Result.Copied
        } catch (_: Exception) {
            Result.CopyFailed
        }
    }

    /**
     * Hand the brochure to a specific app. Direct integration: the text (and an
     * optional image) arrives inside Zalo/Viber/Messenger/LINE's own compose UI.
     */
    fun toApp(context: Context, target: TappyShare.Target, artifact: ShareArtifact, image: Uri?, lang: String): Result {
        val pkg = TappyShare.packageFor(target) ?: return copy(context, artifact.text)
        val body = ShareArtifactBuilder.inboxBody(artifact, lang)
        val intent = Intent(Intent.ACTION_SEND).apply {
            setPackage(pkg)
            putExtra(Intent.EXTRA_SUBJECT, artifact.subject)
            putExtra(Intent.EXTRA_TEXT, body)
            if (image != null) {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, image)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } else {
                type = "text/plain"
            }
        }
        return try {
            context.startActivity(intent)
            Result.OpenedApp(target)
        } catch (_: ActivityNotFoundException) {
            // Insurance first, then the honest message.
            copy(context, body)
            Result.NotInstalledCopied(target)
        } catch (_: Exception) {
            copy(context, body)
            Result.NotInstalledCopied(target)
        }
    }

    /** Facebook's own sharer with the brand url, brochure on the clipboard — the web-parity fallback. */
    fun toDialog(context: Context, target: TappyShare.Target, artifact: ShareArtifact): Result {
        val url = TappyShare.buildShareUrl(target, artifact.url) ?: return copy(context, artifact.text)
        copy(context, artifact.text)
        return try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            Result.CopiedAndOpenedDialog(target)
        } catch (_: Exception) {
            Result.Copied
        }
    }

    fun toEmail(context: Context, artifact: ShareArtifact, lang: String): Result {
        val body = ShareArtifactBuilder.inboxBody(artifact, lang)
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")).apply {
            putExtra(Intent.EXTRA_SUBJECT, artifact.subject)
            putExtra(Intent.EXTRA_TEXT, body)
        }
        return try {
            context.startActivity(intent)
            Result.OpenedEmail(true)
        } catch (_: Exception) {
            copy(context, body)
            Result.OpenedEmail(false)
        }
    }

    /** The system sheet — "More apps". Carries title, text and the image when there is one. */
    fun toSystem(context: Context, artifact: ShareArtifact, image: Uri?, chooserTitle: String): Result {
        val intent = Intent(Intent.ACTION_SEND).apply {
            putExtra(Intent.EXTRA_SUBJECT, artifact.subject)
            putExtra(Intent.EXTRA_TITLE, artifact.subject)
            putExtra(Intent.EXTRA_TEXT, artifact.text)
            if (image != null) {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, image)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } else {
                type = "text/plain"
            }
        }
        return try {
            context.startActivity(Intent.createChooser(intent, chooserTitle))
            Result.OpenedSystemSheet
        } catch (_: Exception) {
            copy(context, artifact.text)
        }
    }

    /**
     * The Tappy Inbox is the web Messenger; there is no Android one and we do not
     * build a second. The brochure is copied so the user can paste it once the
     * web Inbox opens.
     */
    fun toInbox(context: Context, artifact: ShareArtifact, lang: String): Result {
        copy(context, ShareArtifactBuilder.inboxBody(artifact, lang))
        return try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(TappyShare.INBOX_URL)))
            Result.OpenedInbox
        } catch (_: Exception) {
            Result.Copied
        }
    }

    /** Save the image to Pictures when there is one, else the brochure as a text file in Downloads. */
    fun save(context: Context, artifact: ShareArtifact, image: Bitmap?): Result {
        val stamp = System.currentTimeMillis()
        return try {
            if (image != null) {
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, "tappyai-$stamp.png")
                    put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/TappyAI")
                    }
                }
                val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return Result.SaveFailed
                context.contentResolver.openOutputStream(uri)?.use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
                Result.Saved(image = true, uri = uri)
            } else {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, "tappyai-$stamp.txt")
                        put(MediaStore.Downloads.MIME_TYPE, "text/plain")
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/TappyAI")
                    }
                    val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return Result.SaveFailed
                    context.contentResolver.openOutputStream(uri)?.use { it.write(artifact.text.toByteArray(Charsets.UTF_8)) }
                    Result.Saved(image = false, uri = uri)
                } else {
                    val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "TappyAI").apply { mkdirs() }
                    val f = File(dir, "tappyai-$stamp.txt")
                    FileOutputStream(f).use { it.write(artifact.text.toByteArray(Charsets.UTF_8)) }
                    Result.Saved(image = false, uri = Uri.fromFile(f))
                }
            }
        } catch (_: Exception) {
            Result.SaveFailed
        }
    }

    /**
     * A content:// URI for a rendered image, so another app may read it.
     * Written to the app's private cache and exposed only through the FileProvider —
     * never a raw file path.
     */
    fun imageUriFor(context: Context, bitmap: Bitmap): Uri? = try {
        val dir = File(context.cacheDir, "share").apply { mkdirs() }
        val f = File(dir, "tappyai-share.png")
        FileOutputStream(f).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        FileProvider.getUriForFile(context, "${context.packageName}.share", f)
    } catch (_: Exception) {
        null
    }
}
