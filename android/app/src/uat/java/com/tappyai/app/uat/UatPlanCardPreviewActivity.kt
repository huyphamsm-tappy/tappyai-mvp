package com.tappyai.app.uat

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.tappyai.app.chat.ChatResponseParser
import com.tappyai.app.chat.TripPlanCard
import com.tappyai.app.chat.plan.PlanImageManifest
import com.tappyai.app.chat.plan.planImageRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.io.File

/**
 * `uat` build ONLY — draws the plan card v2 from a fixture, OFFLINE (owner 29/09: no real chat while
 * waiting on "AI ổn định"). The e2e runner writes, via `adb shell run-as`, into files/e2e/:
 *  - `plancard.txt` — an assistant reply containing a `[TAPPY_PLAN]…[/TAPPY_PLAN]` block (a saved raw
 *    answer, or fake data with the v2 fields); it goes through the production [ChatResponseParser];
 *  - `planmanifest.json` (optional) — a fixture image manifest; absent → every image is a placeholder.
 * Then: `am start -n <pkg>/com.tappyai.app.uat.UatPlanCardPreviewActivity`.
 */
@AndroidEntryPoint
class UatPlanCardPreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dir = File(filesDir, "e2e")
        val reply = File(dir, "plancard.txt").takeIf { it.isFile }?.readText(Charsets.UTF_8).orEmpty()
        File(dir, "planmanifest.json").takeIf { it.isFile }?.readText()?.let { raw ->
            val json = runCatching { Json.parseToJsonElement(raw) as JsonObject }.getOrNull()
            planImageRepository(this).seedForPreview(PlanImageManifest.parse(json))
        }
        val parsed = ChatResponseParser.parse(reply)
        setContent {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF070B18))
                    .statusBarsPadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                parsed.plan?.let { TripPlanCard(plan = it, planJson = parsed.planJson) }
            }
        }
    }
}
