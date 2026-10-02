package com.tappyai.app.onboarding

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Owner 2026-09-28 (ANDROID-REQUESTS "owner decisions"): the onboarding counter shows the steps the
 * wizard really has — web `onboarding.stepInterests` "Bước 1/2" / `stepLocation` "Bước 2/2" — never the
 * design mock's "2/4".
 */
class OnboardingStepCounterTest {

    @Test fun `two real steps, the counter reads Buoc n-2 like the web`() {
        assertEquals(2, ONBOARDING_TOTAL_STEPS)
        val vi = File("src/main/res/values-vi/strings_onboarding.xml").readText()
        val en = File("src/main/res/values/strings_onboarding.xml").readText()
        assertTrue(vi.contains("<string name=\"onboarding_step_counter\">Bước %1\$d/%2\$d</string>"))
        assertTrue(en.contains("<string name=\"onboarding_step_counter\">Step %1\$d of %2\$d</string>"))
        val screen = File("src/main/java/com/tappyai/app/onboarding/OnboardingScreen.kt").readText()
        assertTrue(screen.contains("R.string.onboarding_step_counter, step, ONBOARDING_TOTAL_STEPS"))
    }

    @Test fun `V3 surface like the web - dark ground for both steps, below the status bar, tiles carry the web descriptions`() {
        val screen = File("src/main/java/com/tappyai/app/onboarding/OnboardingScreen.kt").readText()
        assertTrue(screen.contains("val Ground = Color(0xFF070B18)") && screen.contains(".background(Ob.Ground)"))
        assertTrue("never drawn under the status bar", screen.contains(".statusBarsPadding()"))
        assertTrue(screen.contains("R.drawable.share_otter_mascot"))
        for (id in listOf("food", "spa", "travel", "shopping", "entertainment", "hotel")) assertTrue(id, interestDescResFor(id) != null)
        assertEquals(null, interestDescResFor("music"))
        val vi = File("src/main/res/values-vi/strings_onboarding.xml").readText()
        assertTrue(vi.contains("<string name=\"onboarding_interest_food_desc\">Khám phá quán ngon, công thức nấu ăn và xu hướng ẩm thực mới</string>"))
    }
}
