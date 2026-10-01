package com.tappyai.app.uat

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.tappyai.app.profile.DeleteAccountDialog

/**
 * `uat` build ONLY — draws the REAL account-deletion confirmation ([DeleteAccountDialog], the production composable) with
 * the flag treated as ON, so the owner's R29 text can be photographed on the emulator without turning the UAT server's
 * `ACCOUNT_SELF_DELETE_ENABLED` on. NOTHING is sent: «Xóa vĩnh viễn» only logs. Intent extra `plan`: `true` (active paid plan),
 * `false` (known free), absent/`null` (the app does not know → the generic plan line).
 *   am start -n <pkg>/com.tappyai.app.uat.UatDeleteConfirmPreviewActivity --es plan true
 */
class UatDeleteConfirmPreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val paid: Boolean? = when (intent.getStringExtra("plan")) { "true" -> true; "false" -> false; else -> null }
        setContent {
            androidx.compose.foundation.layout.Box(Modifier.fillMaxSize().background(Color(0xFF070B18))) {
                DeleteAccountDialog(
                    phase = null,
                    supportEmail = "support@tappyai.com",
                    paidPlan = paid,
                    onDelete = { android.util.Log.i("UatPreview", "delete tapped (preview — nothing sent)") },
                    onTyping = {},
                    onDismiss = { finish() },
                    onFinished = { finish() },
                )
            }
        }
    }
}
