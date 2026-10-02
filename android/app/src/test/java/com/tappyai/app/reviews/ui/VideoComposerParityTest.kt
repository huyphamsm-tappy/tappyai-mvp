package com.tappyai.app.reviews.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parity 2026-09-28 (h): the composer's Video tab uploads a clip like the web /reviews/new —
 * MP4/MOV only, ≤ 150MB, ≤ 305 s accepted; a poster frame, then the clip through the SAME three-step
 * `/api/upload/video` session (create → PUT → complete); the post is `content_type: 'video'`,
 * `source_type: 'upload'`, `placeId: video_<ms>`, `placeName` falling back to "Chia sẻ" (web
 * `${mediaMode}_${Date.now()}` / `'Chia sẻ'`). Android's Video tab was a placeholder.
 */
class VideoComposerParityTest {

    @Test
    fun `limits are the web's`() {
        assertEquals(150, ReviewComposerViewModel.MAX_VIDEO_SIZE_MB)
        assertEquals(305, ReviewComposerViewModel.MAX_VIDEO_DURATION_ACCEPT_SEC)
        assertEquals(setOf("video/mp4", "video/quicktime"), ReviewComposerViewModel.VIDEO_TYPES)
    }

    @Test
    fun `a clip or link post gets the web's place fallback and id, a photo post keeps the place slug`() {
        assertEquals("Chia sẻ", composerPlaceName(" "))
        assertEquals("Phở Hòa", composerPlaceName(" Phở Hòa "))
        assertTrue(composerPlaceId(ComposerMediaMode.Video, "Phở", nowMs = 42).equals("video_42"))
        assertTrue(composerPlaceId(ComposerMediaMode.Link, "", nowMs = 7).equals("link_7"))
        assertEquals("community_phở_hòa", composerPlaceId(ComposerMediaMode.Photo, "Phở Hòa", nowMs = 1))
    }

    @Test
    fun `the upload uses the three-step media session`() {
        val up = File("src/main/java/com/tappyai/app/reviews/data/VideoUploader.kt").readText()
        assertTrue(up.contains("\"media.create-upload-session\"") && up.contains("\"media.complete-upload\""))
        assertTrue("clip metadata is neutralised before the PUT", up.indexOf("ClipMetadata.neutralize(") in 0 until up.indexOf(".put("))
    }
}
