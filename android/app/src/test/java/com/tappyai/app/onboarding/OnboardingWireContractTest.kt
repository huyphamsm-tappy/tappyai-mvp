package com.tappyai.app.onboarding

import com.tappyai.app.onboarding.data.OnboardingRequestDto
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the JSON Android sends to `POST api/onboarding` against the exact body the web submits, since
 * the backend reads its fields by name (`const { interests, city } = await req.json()` in
 * `src/app/api/onboarding/route.ts`) and a silent rename would fail only at runtime as a swallowed
 * write — the wizard always navigates on regardless, so a broken body would silently never persist.
 *
 * The interest strings on the wire are the config *ids* (`food`, `spa`, … from
 * `ONBOARDING_INTERESTS` in `src/lib/config/product.ts`), not the i18n label keys — the backend
 * stores them verbatim as `preferences[id]`. This test also guards that the local label map is
 * keyed on those same ids.
 */
class OnboardingWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `submit body matches the web POST shape`() {
        val body = OnboardingRequestDto(
            interests = listOf("food", "shopping"),
            city = "Đà Nẵng",
        )

        assertEquals(
            """{"interests":["food","shopping"],"city":"Đà Nẵng"}""",
            json.encodeToString(body),
        )
    }

    /** Step-1 Skip posts an empty selection — still a valid body, matching the web. */
    @Test
    fun `skip posts an empty interests array`() {
        val body = OnboardingRequestDto(interests = emptyList(), city = "")

        assertEquals("""{"interests":[],"city":""}""", json.encodeToString(body))
    }

    /**
     * Every interest id the web ships in `ONBOARDING_INTERESTS` must resolve to an Android label —
     * an unmapped id is silently dropped from the grid (`mapNotNull`), so this is the guard that a
     * config addition doesn't quietly disappear on Android without a matching string resource.
     */
    @Test
    fun `all web interest ids map to a label`() {
        val webInterestIds = listOf("food", "spa", "travel", "shopping", "entertainment", "hotel")
        for (id in webInterestIds) {
            assertEquals("interest id '$id' must map to a label", true, interestLabelResFor(id) != null)
        }
    }
}
