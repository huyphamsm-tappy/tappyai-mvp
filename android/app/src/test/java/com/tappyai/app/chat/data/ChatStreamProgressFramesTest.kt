package com.tappyai.app.chat.data

import com.tappyai.app.chat.PLACES_ANNOTATION_KIND
import com.tappyai.app.chat.positionsRanked
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A1(a)+(b) (2026-09-20): the `8:` part now carries three things on a place turn — the server's
 * progress sentence (`tappy.progress.v1`), the engine's PRELIMINARY set the moment the rows land,
 * and the decision after the prose. Each element is gated on its own `kind`; the turn's view is
 * the LAST place frame (the ViewModel replaces on every Places event). Frames are verbatim shapes
 * from `streamEnrichment.ts` / `progressAnnotation.ts`.
 */
class ChatStreamProgressFramesTest {

    private val progress = """8:[{"kind":"tappy.progress.v1","v":1,"stage":"found","count":10,"text":"Đã có 10 chỗ phù hợp — đang chọn cho bạn…"}]"""
    private val preliminary = """8:[{"kind":"tappy.places.v1","v":1,"domain":"food","ranked":false,"items":[{"id":"g-1","domain":"food","kind":"place","name":"Béo Ơi Quán","rank":0,"actions":[]}],"shown":3,"preliminary":true}]"""
    private val decision = """8:[{"kind":"tappy.places.v1","v":1,"domain":"food","ranked":true,"items":[{"id":"g-1","domain":"food","kind":"place","name":"Béo Ơi Quán","rank":0,"recommended":true,"actions":[]}],"picked":["g-1"],"shown":3}]"""

    @Test
    fun `a progress frame is a Progress event carrying the server's sentence and stage`() {
        val event = ChatStreamFrames.parse(progress)
        assertTrue(event is ChatStreamEvent.Progress)
        assertEquals("found", (event as ChatStreamEvent.Progress).stage)
        assertEquals("Đã có 10 chỗ phù hợp — đang chọn cho bạn…", event.text)
    }

    @Test
    fun `the preliminary set is a Places event flagged preliminary, unranked, with no pick`() {
        val event = ChatStreamFrames.parse(preliminary) as ChatStreamEvent.Places
        assertTrue(event.view.preliminary)
        assertEquals(false, event.view.ranked)
        assertTrue(event.view.picked.isEmpty())
        assertEquals(PLACES_ANNOTATION_KIND, event.view.kind)
    }

    @Test
    fun `the decision is not preliminary and the last frame wins`() {
        var live: com.tappyai.app.chat.PlacesLiveView? = null
        for (line in listOf(progress, preliminary, decision)) {
            when (val e = ChatStreamFrames.parse(line)) {
                is ChatStreamEvent.Places -> live = e.view
                else -> Unit
            }
        }
        assertFalse(live!!.preliminary)
        assertEquals(listOf("g-1"), live.picked)
    }

    @Test
    fun `an unknown kind on the shared part is skipped, and a progress frame without text is nothing`() {
        assertNull(ChatStreamFrames.parse("""8:[{"kind":"tappy.other.v9","x":1}]"""))
        assertNull(ChatStreamFrames.parse("""8:[{"kind":"tappy.progress.v1","stage":"found","text":""}]"""))
    }

    // F (2026-09-20): web parity for the A.4 fallback — the reply named venues that matched no row.
    private val unmatched = """8:[{"kind":"tappy.places.v1","v":1,"domain":"food","ranked":true,"items":[{"id":"g-1","domain":"food","kind":"place","name":"Béo Ơi Quán","rank":0,"actions":[]}],"picked":[],"shown":3,"pickUnmatched":true}]"""

    @Test
    fun `pickUnmatched is read and no position is ranked on such a view, while a ranked decision still is`() {
        val view = (ChatStreamFrames.parse(unmatched) as ChatStreamEvent.Places).view
        assertTrue(view.pickUnmatched)
        assertFalse(view.positionsRanked())
        val decided = (ChatStreamFrames.parse(decision) as ChatStreamEvent.Places).view
        assertFalse(decided.pickUnmatched)
        assertTrue(decided.positionsRanked())
    }
}
