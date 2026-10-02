package com.tappyai.e2e.sharestub

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import org.json.JSONObject

/** Logs one JSON line per received share (tag E2E_SHARE) — what the e2e flow asserts on — then closes. */
class ReceiveActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val i = intent
        val stream: Uri? = if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else @Suppress("DEPRECATION") i.getParcelableExtra(Intent.EXTRA_STREAM)
        val bytes = stream?.let { u -> runCatching { contentResolver.openInputStream(u)?.use { it.readBytes().size } }.getOrNull() }
        val head = stream?.let { u -> runCatching { contentResolver.openInputStream(u)?.use { s -> ByteArray(12).also { s.read(it) } } }.getOrNull() }
        val line = JSONObject()
            .put("receiver", packageName)
            .put("action", i.action)
            .put("type", i.type)
            .put("text", i.getStringExtra(Intent.EXTRA_TEXT))
            .put("subject", i.getStringExtra(Intent.EXTRA_SUBJECT))
            .put("stream", stream?.toString())
            .put("streamMime", stream?.let { contentResolver.getType(it) })
            .put("streamBytes", bytes ?: -1)
            .put("streamMagic", head?.joinToString("") { "%02x".format(it) })
        Log.i("E2E_SHARE", line.toString())
        finish()
    }
}
