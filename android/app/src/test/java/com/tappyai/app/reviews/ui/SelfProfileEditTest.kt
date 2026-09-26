package com.tappyai.app.reviews.ui

import com.tappyai.app.R
import com.tappyai.app.account.AccountProfile
import com.tappyai.app.account.data.AccountErrorMessages
import com.tappyai.app.account.data.AccountRepository
import com.tappyai.app.reviews.data.PickedImage
import com.tappyai.app.reviews.data.PickedImageReader
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * Explore → My Profile → Sửa hồ sơ (owner revision 2026-09-12).
 *
 * The ViewModel is driven for real against a fake `AccountRepository`: initial values come from
 * `GET /api/profile`, Save is one `PATCH` with the trimmed name and bio, a blank name never
 * reaches the server, the avatar rules refuse before upload, and the screen/nav inventory is
 * pinned by a source read (same reasoning as `SelfProfileV3Test`).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SelfProfileEditTest {

    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private class FakeAccount(
        var profile: AccountProfile = AccountProfile("Huy Phạm", "founder@tappyai.com", "Yêu du lịch", "", "https://a/old.png", "vi"),
        var patchFails: Boolean = false,
    ) : AccountRepository {
        val patches = mutableListOf<Pair<String, String>>()
        val uploads = mutableListOf<Pair<Int, String>>()
        override suspend fun getProfile(): NetworkResult<AccountProfile> = NetworkResult.Success(profile)
        override suspend fun updateProfile(fullName: String, bio: String): NetworkResult<Unit> {
            patches += fullName to bio
            if (patchFails) return NetworkResult.Error(NetworkError.Http(500, "boom"))
            profile = profile.copy(fullName = fullName, bio = bio)
            return NetworkResult.Success(Unit)
        }
        override suspend fun updateLanguage(languageTag: String): NetworkResult<Unit> = NetworkResult.Success(Unit)
        override suspend fun uploadAvatar(bytes: ByteArray, mimeType: String): NetworkResult<String> {
            uploads += bytes.size to mimeType
            return NetworkResult.Success("https://a/new.png")
        }
    }

    private object Strings : StringProvider {
        override fun get(resId: Int): String = "str:$resId"
        override fun get(resId: Int, vararg args: Any): String = "str:$resId"
    }

    private object NoLog : LoggerProvider {
        override fun d(tag: String, message: String) {}
        override fun i(tag: String, message: String) {}
        override fun w(tag: String, message: String, throwable: Throwable?) {}
        override fun e(tag: String, message: String, throwable: Throwable?) {}
    }

    private object NoReader : PickedImageReader {
        override suspend fun read(uri: android.net.Uri): PickedImage? = null
    }

    private fun vm(account: FakeAccount) =
        SelfProfileEditViewModel(account, NoLog, AccountErrorMessages(Strings), Strings, NoReader)

    // ── initial values, from the stored profile ───────────────────────────

    @Test
    fun `the fields start as the stored profile - name, bio, avatar`() = runTest {
        val vm = vm(FakeAccount())
        advanceUntilIdle()
        val s = vm.uiState.value
        assertFalse(s.isLoading)
        assertEquals("Huy Phạm", s.name)
        assertEquals("Yêu du lịch", s.bio)
        assertEquals("https://a/old.png", s.avatarUrl)
        assertTrue(s.canSave)
    }

    // ── Save = one PATCH with the trimmed values, then the Saved event ────

    @Test
    fun `Save sends the trimmed name and bio in one PATCH and reports Saved`() = runTest {
        val account = FakeAccount()
        val vm = vm(account)
        advanceUntilIdle()
        vm.onNameChange("  Huy Phạm Explore  ")
        vm.onBioChange(" Yêu du lịch - Thích khám phá ")
        vm.onSave()
        val event = vm.events.first()
        advanceUntilIdle()
        assertEquals(listOf("Huy Phạm Explore" to "Yêu du lịch - Thích khám phá"), account.patches)
        assertEquals(SelfProfileEditEvent.Saved, event)
        assertEquals("Huy Phạm Explore", vm.uiState.value.name)
        assertFalse(vm.uiState.value.isSaving)
        // The repository now returns what was saved — what the profile screen re-reads on return.
        assertEquals("Huy Phạm Explore", account.profile.fullName)
        assertEquals("Yêu du lịch - Thích khám phá", account.profile.bio)
    }

    @Test
    fun `a blank name never reaches the server - the field shows the rule instead`() = runTest {
        val account = FakeAccount()
        val vm = vm(account)
        advanceUntilIdle()
        vm.onNameChange("   ")
        assertFalse(vm.uiState.value.canSave)
        vm.onSave()
        advanceUntilIdle()
        assertTrue(account.patches.isEmpty())
        assertEquals(R.string.reviews_self_edit_name_required, vm.uiState.value.nameError)
        vm.onNameChange("H")
        assertNull("typing clears the rule", vm.uiState.value.nameError)
    }

    @Test
    fun `a failed PATCH reports SaveFailed and keeps the draft`() = runTest {
        val account = FakeAccount(patchFails = true)
        val vm = vm(account)
        advanceUntilIdle()
        vm.onNameChange("Draft")
        vm.onSave()
        val event = vm.events.first()
        advanceUntilIdle()
        assertTrue(event is SelfProfileEditEvent.SaveFailed)
        assertEquals("Draft", vm.uiState.value.name)
        assertFalse(vm.uiState.value.isSaving)
    }

    @Test
    fun `the web caps are enforced while typing - 100 for the name, 200 for the bio`() = runTest {
        val vm = vm(FakeAccount())
        advanceUntilIdle()
        vm.onNameChange("a".repeat(100)); assertEquals(100, vm.uiState.value.name.length)
        vm.onNameChange("a".repeat(101)); assertEquals(100, vm.uiState.value.name.length)
        vm.onBioChange("b".repeat(200)); assertEquals(200, vm.uiState.value.bio.length)
        vm.onBioChange("b".repeat(201)); assertEquals(200, vm.uiState.value.bio.length)
        assertEquals(0, vm.uiState.value.bioRemaining)
    }

    // ── avatar rules, before any upload ───────────────────────────────────

    @Test
    fun `avatar rules - unreadable, too large and non-image are refused, an image is uploaded`() {
        assertEquals(R.string.account_avatar_read_failed, SelfProfileEditViewModel.avatarRejection(null))
        assertEquals(R.string.account_avatar_too_large, SelfProfileEditViewModel.avatarRejection(PickedImage(ByteArray(3 * 1024 * 1024 + 1), "image/png")))
        assertEquals(R.string.account_avatar_invalid_type, SelfProfileEditViewModel.avatarRejection(PickedImage(ByteArray(10), "video/mp4")))
        assertEquals(R.string.account_avatar_invalid_type, SelfProfileEditViewModel.avatarRejection(PickedImage(ByteArray(10), null)))
        assertNull(SelfProfileEditViewModel.avatarRejection(PickedImage(ByteArray(10), "image/jpeg")))
    }

    // ── the screen and the route ──────────────────────────────────────────

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    @Test
    fun `the screen offers exactly the stored fields - avatar, name, bio - with resource labels in EN and VI`() {
        val screen = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileEditScreen.kt")
        assertTrue("avatar picker on the existing PickVisualMedia contract", screen.contains("ActivityResultContracts.PickVisualMedia()") && screen.contains("viewModel::onAvatarPicked"))
        assertTrue(screen.contains("onValueChange = viewModel::onNameChange"))
        assertTrue(screen.contains("onValueChange = viewModel::onBioChange"))
        assertTrue("Save is the header's primary action", screen.contains("SaveButton(enabled = uiState.canSave, saving = uiState.isSaving, onClick = viewModel::onSave)"))
        assertTrue("Saved pops back to the profile", screen.contains("SelfProfileEditEvent.Saved ->") && screen.contains("onSaved()"))
        assertTrue("the night palette", screen.contains(".background(ExploreV3.Background)"))
        assertFalse("no website / handle / city field is invented", screen.contains("onWebsiteChange") || screen.contains("onHandleChange") || screen.contains("onCityChange"))
        assertFalse(Regex("text = \"[A-Za-z]").containsMatchIn(screen))
        val en = src("app/src/main/res/values/strings_reviews.xml")
        val vi = src("app/src/main/res/values-vi/strings_reviews.xml")
        for (key in listOf("reviews_self_edit_title", "reviews_self_edit_save", "reviews_self_edit_saved", "reviews_self_edit_change_avatar", "reviews_self_edit_name_label", "reviews_self_edit_name_required", "reviews_self_edit_bio_label", "reviews_self_edit_scope_note")) {
            assertTrue("$key en", en.contains("name=\"$key\"")); assertTrue("$key vi", vi.contains("name=\"$key\""))
        }
        assertTrue(vi.contains(">Sửa hồ sơ<") && vi.contains(">Lưu<") && vi.contains(">Tên hiển thị<") && vi.contains(">Tiểu sử<"))
    }

    @Test
    fun `Sửa hồ sơ opens Explore's own EditProfile route, never the app's Tôi tab, and Save or Back pop to the profile`() {
        val nav = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")
        val self = nav.substring(nav.indexOf("composable<ReviewsRoute.SelfProfile>"), nav.indexOf("composable<ReviewsRoute.EditProfile>"))
        assertTrue(self.contains("onEditProfile = { navController.navigate(ReviewsRoute.EditProfile) }"))
        assertFalse("the shell's Tôi-tab callback is not what Sửa hồ sơ calls", self.contains("onEditProfile = onEditProfile"))
        val edit = nav.substring(nav.indexOf("composable<ReviewsRoute.EditProfile>"), nav.indexOf("composable<ReviewsRoute.Detail>"))
        assertTrue(edit.contains("SelfProfileEditScreen("))
        assertTrue("both exits pop back to the profile", edit.contains("navController.popBackStack()"))
        assertTrue(src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt").contains("data object EditProfile : ReviewsRoute"))
        // A destination leaves composition while the next one is up, so `ReloadOnResume` sees a fresh
        // first resume on return and skips — the nav-result flag is what makes the saved values show.
        assertTrue(edit.contains("savedStateHandle?.set(PROFILE_CHANGED_RESULT, true)"))
        assertTrue("set on Back as well: the avatar uploads before Save", edit.contains("onBack = { leave() }") && edit.contains("onSaved = { leave() }"))
        assertTrue(self.contains("getStateFlow(PROFILE_CHANGED_RESULT, false)") && self.contains("reloadRequested = changed"))
        val profile = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileScreen.kt")
        assertTrue(profile.contains("LaunchedEffect(reloadRequested)") && profile.contains("viewModel.load()"))
    }

    @Test
    fun `the self profile reads the bio from GET api-profile and draws it`() {
        val vm = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileViewModel.kt")
        assertTrue(vm.contains("val account = async { accountRepository.getProfile() }"))
        assertTrue(vm.contains("val bio = (account.await() as? NetworkResult.Success)?.data?.bio"))
        val screen = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileScreen.kt")
        assertTrue(screen.contains("facts.bio?.let { bio ->"))
        assertEquals("Yêu du lịch", selfProfileFacts(null, emptyList(), null, "  Yêu du lịch ").bio)
        assertNull(selfProfileFacts(null, emptyList(), null, "   ").bio)
    }

    // ── video: the detail player is not muted ─────────────────────────────

    @Test
    fun `the clip opened from the profile plays with sound - the detail passes active and audioUnlocked, the player keeps volume 1`() {
        val surface = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewVideoSurface.kt")
        assertTrue(surface.contains("volume = 1f"))
        assertTrue(surface.contains("player.volume = if (audioUnlocked) 1f else 0f"))
        assertFalse("no mute flag anywhere in the upload lane", surface.contains("setVolume(0f)") || surface.contains("isDeviceMuted = true"))
        val screens = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        val detail = screens.substring(screens.indexOf("internal fun ReviewDetailScreen("), screens.indexOf("private fun ScreenHeader(").takeIf { it > 0 } ?: screens.length)
        assertTrue(detail.contains("active = true,"))
        assertTrue(detail.contains("audioUnlocked = true,"))
        val pager = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewClipPager.kt")
        assertTrue("the feed's own audio default is unchanged (now in the shared pager)", pager.contains("var audioUnlocked by rememberSaveable { mutableStateOf(true) }"))
    }
}
