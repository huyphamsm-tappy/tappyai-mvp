package com.tappyai.app.uat

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.tappyai.app.safety.ReportOutcome
import com.tappyai.app.safety.ui.BlockConfirmDialog
import com.tappyai.app.safety.ui.BlockedUsersContent
import com.tappyai.app.safety.ui.ReportDialog
import com.tappyai.app.safety.ui.UgcTermsDialog
import com.tappyai.core.designsystem.theme.TappyAITheme

/**
 * `uat` build ONLY — draws the REAL safety composables (the production ones) from fixtures, so the
 * block UI can be photographed on the emulator although the UAT server does not yet expose the
 * Phase 8 block routes (`/api/config` → `p8` absent). NOTHING is sent anywhere.
 *   am start -n <pkg>/com.tappyai.app.uat.UatSafetyPreviewActivity --es view blocked|confirm|terms|user|failed
 */
class UatSafetyPreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val view = intent.getStringExtra("view") ?: "blocked"
        setContent {
            TappyAITheme(dynamicColor = false) {
                Box(Modifier.fillMaxSize().background(Color(0xFF070B18))) {
                    when (view) {
                        "confirm" -> BlockConfirmDialog(name = "E2E Người khác", onConfirm = { finish() }, onDismiss = { finish() })
                        "terms" -> UgcTermsDialog(onAgree = { finish() }, onDismiss = { finish() })
                        "user" -> ReportDialog(
                            title = "Báo cáo người dùng",
                            onSubmit = { ReportOutcome.Sent },
                            onFiled = {},
                            onDismiss = { finish() },
                        )
                        "failed" -> ReportDialog(
                            title = "Báo cáo bài đăng",
                            onSubmit = { ReportOutcome.Failed },
                            onFiled = {},
                            onDismiss = { finish() },
                        )
                        else -> BlockedUsersContent(
                            blocked = listOf("u1", "u2"),
                            names = mapOf("u1" to "E2E Người khác"),
                            onBack = { finish() },
                            onUnblock = {},
                        )
                    }
                }
            }
        }
    }
}
