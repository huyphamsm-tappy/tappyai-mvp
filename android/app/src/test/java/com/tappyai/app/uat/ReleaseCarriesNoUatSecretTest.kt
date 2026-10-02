package com.tappyai.app.uat

import com.tappyai.app.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Vercel bypass secret exists ONLY in the `uat` build. Runs in every variant's unit tests
 * (`testDebugUnitTest`, `testReleaseUnitTest`, `testUatUnitTest`) against that variant's own
 * generated BuildConfig, so a release that ever carried the secret fails here.
 */
class ReleaseCarriesNoUatSecretTest {

    @Test
    fun `only the uat build carries the bypass secret and the uat backend`() {
        if (BuildConfig.BUILD_TYPE == "uat") {
            assertTrue("uat build without a bypass secret", BuildConfig.VERCEL_BYPASS_SECRET.isNotEmpty())
            assertEquals("https://uat.tappyai.com/", BuildConfig.API_BASE_URL)
            assertTrue(BuildConfig.SUPABASE_URL.startsWith("https://zdaprdfgpbpnxyofagmc."))
        } else {
            assertEquals("", BuildConfig.VERCEL_BYPASS_SECRET)
            assertTrue(!BuildConfig.API_BASE_URL.contains("uat.tappyai.com"))
        }
    }
}
