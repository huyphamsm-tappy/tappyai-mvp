package com.tappyai.app.account

import com.tappyai.app.account.data.ProfileDto
import com.tappyai.app.account.data.toDomain
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parity 2026-09-28 (g): the web edits a profile COVER on /profile/edit ("Ảnh bìa" — Thay ảnh bìa /
 * Gỡ ảnh bìa, JPG/PNG/WebP ≤ 5MB, `POST /api/profile` field `cover`, clear = `PATCH {cover_url:null}`)
 * and shows it on /profile. Android had no cover at all ("there is no cover column" — there is now).
 */
class CoverPhotoParityTest {

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Test
    fun `the profile carries cover_url`() {
        val withCover = json.decodeFromString<ProfileDto>("""{"full_name":"A","cover_url":"https://x/c.jpg"}""").toDomain()
        val without = json.decodeFromString<ProfileDto>("""{"full_name":"A","cover_url":null}""").toDomain()
        assertEquals("https://x/c.jpg", withCover.coverUrl)
        assertNull(without.coverUrl)
    }

    @Test
    fun `upload and removal use the web's contract`() {
        val repo = File("src/main/java/com/tappyai/app/account/data/RealAccountRepository.kt").readText()
        assertTrue(repo.contains("""MultipartBody.Part.createFormData("cover", "cover", body)"""))
        assertTrue(repo.contains("api.clearCover(ClearCoverRequestDto())"))
        val vm = File("src/main/java/com/tappyai/app/account/AccountViewModel.kt").readText()
        assertTrue("5MB, the web's COVER_MAX_BYTES", vm.contains("MAX_COVER_BYTES = 5 * 1024 * 1024"))
    }

    @Test
    fun `edit screen and hub show the cover`() {
        val edit = File("src/main/java/com/tappyai/app/account/AccountEditScreen.kt").readText()
        for (k in listOf("account_cover_title", "account_cover_hint", "account_cover_none", "account_cover_change", "account_cover_remove")) assertTrue(k, edit.contains("R.string.$k"))
        val hub = File("src/main/java/com/tappyai/app/profile/ProfileHubV3.kt").readText()
        assertTrue(hub.contains("profile?.coverUrl"))
    }
}
