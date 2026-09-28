package com.tappyai.app.uat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.tappyai.app.MainActivity
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import javax.inject.Inject

/**
 * e2e test hook — `uat` build ONLY (src/uat; guarded by UatTestHookOnlyInUatTest and
 * android/e2e/scripts/verify-release-clean.mjs).
 *
 * The e2e runner never types a password or a token into the UI. It makes a session for a seeded
 * AUDIT account in code, writes it into this app's PRIVATE files dir with `adb shell run-as` (possible only because the
 * uat build is debuggable), and starts:
 *
 *   am start -n <pkg>/com.tappyai.app.uat.UatTestHookActivity --es op session
 *       → reads files/e2e/session.json {access_token, refresh_token}, imports it through the SAME
 *         path a Zalo/OAuth sign-in completes through (AuthRepository.handleOAuthRedirectIntent),
 *         deletes the file, opens the app.
 *   am start ... --es op signout   → signs out (back to a guest session), opens the app.
 *   am start ... --es op clip      → files/e2e/clip.txt onto the clipboard (Vietnamese text that
 *         `adb shell input text` cannot type), deletes the file, returns to the app.
 *
 * Nothing is logged. The file is deleted as soon as it is read.
 */
@AndroidEntryPoint
class UatTestHookActivity : ComponentActivity() {

    @Inject lateinit var authRepository: AuthRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dir = File(filesDir, "e2e")
        when (intent.getStringExtra("op")) {
            "session" -> {
                val file = File(dir, "session.json")
                if (!file.isFile) return finish()
                val json = JSONObject(file.readText())
                file.delete()
                val callback = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse(
                        "tappyai://auth-callback#access_token=" + Uri.encode(json.getString("access_token")) +
                            "&refresh_token=" + Uri.encode(json.getString("refresh_token")),
                    ),
                )
                lifecycleScope.launch {
                    authRepository.handleOAuthRedirectIntent(callback)
                    openApp()
                }
            }
            "signout" -> lifecycleScope.launch {
                authRepository.signOut()
                openApp()
            }
            "clip" -> {
                val file = File(dir, "clip.txt")
                if (file.isFile) {
                    val text = file.readText(Charsets.UTF_8)
                    file.delete()
                    getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("e2e", text))
                }
                finish()
            }
            else -> finish()
        }
    }

    private fun openApp() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }
}
