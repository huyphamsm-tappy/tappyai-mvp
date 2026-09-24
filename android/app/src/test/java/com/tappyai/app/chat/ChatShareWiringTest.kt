package com.tappyai.app.chat

import com.tappyai.app.share.PlanShareOutcome
import com.tappyai.app.share.PlanShareRepository
import com.tappyai.app.share.PlanShareState
import com.tappyai.app.share.PlanShareViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The chat screen hands each turn's share sources to the share surfaces.
 *
 * PRELAUNCH Android UAT (2026-09-25): the plan card's "Chia sẻ lịch trình" sat on
 * "Đang tạo kế hoạch chia sẻ…" forever and no request left the app. 3731efa had wired
 * `planJson` into [TripPlanCard] and the plan / places / subject into [MessageActionBar]; the
 * merge a6ca9f0 dropped all of it. With no `planJson` the sheet never publishes, and the message
 * bar shared a place turn as bare prose instead of the recommendation brochure.
 */
class ChatShareWiringTest {

    private val screen by lazy { File(findSrc("app/src/main/java/com/tappyai/app/chat/ChatScreen.kt")).readText() }

    @Test
    fun `the plan card receives the verbatim plan block it publishes`() {
        assertTrue(screen.contains("TripPlanCard(plan, planJson = message.planJson)"))
    }

    @Test
    fun `the message bar receives the places, the plan and the subject, in the web's precedence`() {
        assertTrue(screen.contains("placesView = message.placesView,"))
        assertTrue(screen.contains("plan = message.plan,"))
        assertTrue(screen.contains("planJson = message.planJson,"))
        assertTrue(screen.contains("shareSubject = shareSubjectFor(messages, message),"))
    }

    @Test
    fun `a sheet opened with no plan block says so instead of spinning forever`() {
        val vm = PlanShareViewModel(object : PlanShareRepository {
            override suspend fun publish(planJson: String): PlanShareOutcome = error("must not publish without a block")
        })
        vm.publish(null)
        assertEquals(PlanShareState.Failed(PlanShareOutcome.NoPlanPayload), vm.state.value)
    }

    private fun findSrc(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.path
            dir = dir.parentFile
        }
        error("$rel not found")
    }
}
