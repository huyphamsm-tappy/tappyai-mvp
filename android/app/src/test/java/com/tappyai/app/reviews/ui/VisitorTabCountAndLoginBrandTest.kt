package com.tappyai.app.reviews.ui

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Two small web-parity items (ANDROID-PROGRESS "sau release" list, done 29/09):
 *  - a visitor's profile tabs carry their counts like the web `PublicProfileView` (`tabCount`):
 *    "Bài đăng 2", "Chia sẻ 1" — counted from the very lists the tabs show; the owner's private
 *    collections keep no number (the web shows one only once loaded);
 *  - the login buttons carry the brand marks the web /login draws (Google "G", Zalo tile).
 */
class VisitorTabCountAndLoginBrandTest {

    @Test fun `visitor tab counts come from the lists the tabs render`() {
        val s = File("src/main/java/com/tappyai/app/reviews/ui/SelfProfileScreen.kt").readText()
        assertTrue(s.contains("mapOf(CreatorProfileTab.Posts to it.posts.size, CreatorProfileTab.Shared to it.shares.size)"))
        assertTrue(s.contains("count = if (showCollections) null else visitorCounts?.get(t)"))
    }

    @Test fun `login buttons show the Google G and the Zalo tile`() {
        val s = File("../features/auth/src/main/java/com/tappyai/features/auth/ui/login/LoginScreen.kt").readText()
        assertTrue(s.contains("R.drawable.ic_brand_google") && s.contains("leadingIcon = { ZaloMark() }"))
        val g = File("../features/auth/src/main/res/drawable/ic_brand_google.xml").readText()
        listOf("#4285F4", "#34A853", "#FBBC05", "#EA4335").forEach { assertTrue(it, g.contains(it)) }
    }
}
