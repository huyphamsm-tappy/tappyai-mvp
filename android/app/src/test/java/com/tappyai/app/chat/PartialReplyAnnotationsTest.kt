package com.tappyai.app.chat

import com.tappyai.app.chat.data.ChartPoint
import com.tappyai.app.chat.data.DocMediaItem
import com.tappyai.app.chat.data.ResearchChart
import com.tappyai.app.chat.data.ResearchLink
import com.tappyai.app.chat.data.ResearchStatus
import com.tappyai.app.chat.data.ResearchStep
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Review 01/11 (Android = the web). The web keeps a Deep Research turn's research card, charts and section pictures with the partial text when the
 * person stops it or the connection drops after text: they ride on the message annotations. Android's partial reply carried the text only, so a
 * report written up to its last section lost its sources and its download card. The annotations of the turn are kept in both paths.
 */
class PartialReplyAnnotationsTest {
    private fun repo(): File = generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "docs/uat/evidence").isDirectory }

    private val research = ResearchStatus("Xe điện", "writing", listOf(ResearchStep("Tìm nguồn", "done")), 3, listOf(ResearchLink(1, "BYD", "https://byd.com/a")))
    private val charts = listOf(ResearchChart("Doanh số", "Bán xe", "triệu xe", "bar", listOf(ChartPoint("BYD", 2.26, 1))))
    private val media = listOf(DocMediaItem("Doanh số", "https://i.example/a.jpg", "web"))
    private val report = "# Xe điện 2026\n\nBYD dẫn đầu thị trường với hơn hai triệu xe bán ra trong năm, theo số liệu của hãng.\n\n## Doanh số\n\nTesla đứng thứ hai."

    @Test fun `a stopped or interrupted report keeps its research card, charts and pictures`() {
        val ann = TurnAnnotations().also { it.research = research; it.charts = charts; it.docMedia = media }
        for (interrupted in listOf(false, true)) {
            val kept = partialReplyMessage(7L, report, interrupted, ann)!!
            assertEquals(research, kept.research)
            assertEquals(charts, kept.charts)
            assertEquals(media, kept.docMedia)
            assertEquals(if (interrupted) "interrupted" else null, kept.turnStatus)
        }
    }

    @Test fun `without annotations the partial reply is what it was`() {
        val kept = partialReplyMessage(8L, report, interrupted = false)!!
        assertNull(kept.research)
        assertTrue(kept.charts.isEmpty())
        assertTrue(kept.docMedia.isEmpty())
    }

    @Test fun `the view model hands the turn's annotations to both paths`() {
        val vm = File(repo(), "android/app/src/main/java/com/tappyai/app/chat/ChatViewModel.kt").readText()
        assertTrue(vm.contains("partialReplyMessage(nextId++, partial, interrupted = false, currentAnnotations)"))
        assertTrue(vm.contains("partialReplyMessage(nextId++, reply.toString(), interrupted = true, currentAnnotations)"))
    }
}
