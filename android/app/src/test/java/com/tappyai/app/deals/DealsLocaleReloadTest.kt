package com.tappyai.app.deals

import com.tappyai.app.deals.data.DealsRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/**
 * The Deals feed is localized SERVER-side, so a language switch has to refetch it.
 *
 * REGRESSION (permanent). `category` and `description` do not come from string resources — they
 * arrive already translated, chosen by the `?lang=` the request carried. The repository resolves
 * that tag at call time and was never wrong; the defect was that nobody called again.
 * `DealsViewModel` loaded once from `init`, and below API 33 (minSdk is 26, the test device is 31)
 * a language switch re-resolves resources WITHOUT recreating the ViewModel. Device-measured on
 * SM-A127F: after switching English → Vietnamese the subtitle read "Tappy chọn lọc 7 ưu đãi tốt
 * nhất" directly above a card still reading "Shopping · Online marketplace — everything you need",
 * and it stayed that way until the next force stop.
 *
 * These tests drive the DATA path, not a string resource: the fake serves whatever language it is
 * currently set to, exactly as the real backend does, so a ViewModel that fails to refetch keeps
 * serving the other language's payload and the assertions fail on the CONTENT.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DealsLocaleReloadTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    /**
     * Stands in for the backend: answers in whichever language [lang] is set to at the moment of
     * the call, which is what makes "did it refetch?" observable as a content difference.
     */
    private class FakeDeals : DealsRepository {
        var lang = "en"
        var calls = 0

        override suspend fun getDeals(): NetworkResult<List<Deal>> {
            calls++
            val vietnamese = lang == "vi"
            return NetworkResult.Success(
                listOf(
                    Deal(
                        id = "shopee",
                        partnerName = "Shopee",
                        category = if (vietnamese) "Mua sắm" else "Shopping",
                        categoryKey = "Mua sắm",
                        title = "Shopee",
                        description = if (vietnamese) "Sàn mua sắm online" else "Online marketplace",
                        officialUrl = "https://shopee.vn",
                        logoImage = null,
                        discountLabel = null,
                        voucherCode = null,
                        endAt = null,
                    ),
                ),
            )
        }

        override suspend fun recordClick(dealId: String) = Unit
    }

    private class FailingDeals : DealsRepository {
        var calls = 0
        override suspend fun getDeals(): NetworkResult<List<Deal>> {
            calls++
            return NetworkResult.Error(NetworkError.NoConnectivity)
        }
        override suspend fun recordClick(dealId: String) = Unit
    }

    private fun viewModel(repository: DealsRepository) = DealsViewModel(
        repository = repository,
        logger = object : LoggerProvider {
            override fun d(tag: String, message: String) = Unit
            override fun i(tag: String, message: String) = Unit
            override fun w(tag: String, message: String, throwable: Throwable?) = Unit
            override fun e(tag: String, message: String, throwable: Throwable?) = Unit
        },
        stringProvider = object : StringProvider {
            override fun get(resId: Int) = "error"
            override fun get(resId: Int, vararg args: Any) = "error"
        },
    )

    private fun UiState<List<Deal>>.first(): Deal = (this as UiState.Success).data.single()

    @Test
    fun `switching English to Vietnamese reloads the server-localized content`() = runTest {
        val repo = FakeDeals().apply { lang = "en" }
        val vm = viewModel(repo)

        vm.onLanguageResolved(english = true)
        advanceUntilIdle()
        assertEquals("Shopping", vm.uiState.first().category)
        assertEquals("Online marketplace", vm.uiState.first().description)

        repo.lang = "vi"
        vm.onLanguageResolved(english = false)
        advanceUntilIdle()

        assertEquals(
            "category is localized by the server, so it must be refetched, not re-resolved",
            "Mua sắm",
            vm.uiState.first().category,
        )
        assertEquals("Sàn mua sắm online", vm.uiState.first().description)
        assertEquals(2, repo.calls)
    }

    @Test
    fun `switching Vietnamese to English reloads the server-localized content`() = runTest {
        val repo = FakeDeals().apply { lang = "vi" }
        val vm = viewModel(repo)

        vm.onLanguageResolved(english = false)
        advanceUntilIdle()
        assertEquals("Mua sắm", vm.uiState.first().category)

        repo.lang = "en"
        vm.onLanguageResolved(english = true)
        advanceUntilIdle()

        assertEquals("Shopping", vm.uiState.first().category)
        assertEquals("Online marketplace", vm.uiState.first().description)
        assertEquals(2, repo.calls)
    }

    /**
     * The other half of the fix. Reloading on EVERY call would spend a request each time the user
     * returns to the tab, which is a cost regression rather than a bug fix — so the reload has to
     * be driven by the language actually changing.
     */
    @Test
    fun `returning to the tab in the same language does not refetch`() = runTest {
        val repo = FakeDeals()
        val vm = viewModel(repo)

        vm.onLanguageResolved(english = true)
        advanceUntilIdle()
        repeat(3) { vm.onLanguageResolved(english = true) }
        advanceUntilIdle()

        assertEquals(1, repo.calls)
    }

    /** A failed load is not "loaded" — coming back to the tab should try again by itself. */
    @Test
    fun `a failed load retries when the screen is shown again`() = runTest {
        val repo = FailingDeals()
        val vm = viewModel(repo)

        vm.onLanguageResolved(english = true)
        advanceUntilIdle()
        vm.onLanguageResolved(english = true)
        advanceUntilIdle()

        assertEquals(2, repo.calls)
    }

    /**
     * Nothing loads until the screen reports which language it resolved. The load used to be in
     * `init`, which is exactly what made the data outlive the language it was fetched in.
     */
    @Test
    fun `no request is made before the screen reports its language`() = runTest {
        val repo = FakeDeals()
        viewModel(repo)
        advanceUntilIdle()

        assertEquals(0, repo.calls)
    }
}
