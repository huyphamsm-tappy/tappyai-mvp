package com.tappyai.app.chat

import com.tappyai.app.membership.data.MembershipApi
import com.tappyai.app.membership.data.MyPlanDto
import com.tappyai.app.membership.data.MyPlanIdDto
import com.tappyai.app.membership.data.MySubscriptionDto
import com.tappyai.app.membership.data.PlanAccess
import com.tappyai.app.membership.data.RealMembershipRepository
import com.tappyai.app.membership.data.SubscriptionDto
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.File

/**
 * The composer's mode menu follows the plan, as the server enforces it (web src/lib/plans/tiers.ts: Pip/Free and visitors chat in Chat only;
 * Coco / MoMo / Tappy have every mode). The app only hides what the server would run as Chat anyway. Off or in doubt, the menu stays whole:
 * `/api/payments/me` answers 404 while SUBSCRIPTIONS_ENABLED is off, and any failure (offline, 5xx, bad body) must never take a mode away.
 */
class ChatModeTierMenuTest {

    private fun access(signedIn: Boolean = true, state: String? = "ACTIVE", plan: String? = "coco") = PlanAccess(signedIn, state, plan)

    @Test fun `no answer about the plan keeps the whole menu`() {
        assertEquals(ChatMode.menu, ChatMode.menuFor(null))
    }

    @Test fun `a visitor or an account without an active plan sees no mode, only attaching`() {
        assertEquals(emptyList<ChatMode>(), ChatMode.menuFor(access(signedIn = false, state = null, plan = null)))
        for (state in listOf("NONE", "PENDING", "EXPIRED", "CANCELLED", null)) {
            assertEquals(state, emptyList<ChatMode>(), ChatMode.menuFor(access(state = state, plan = "coco")))
        }
        assertEquals(emptyList<ChatMode>(), ChatMode.menuFor(access(plan = "free")))
    }

    @Test fun `every paid plan, and an active older plan the server cannot name, keeps the whole menu`() {
        for (plan in listOf("pip", "momo", "coco", "milo", "sunny", "promax1m", "promax3m", null)) {
            assertEquals(plan, ChatMode.menu, ChatMode.menuFor(access(plan = plan)))
        }
    }

    private class FakeApi(private val me: () -> MyPlanDto) : MembershipApi {
        override suspend fun getSubscription() = SubscriptionDto()
        override suspend fun getMyPlan() = me()
    }

    private fun notFound(): HttpException =
        HttpException(Response.error<Any>(404, "{}".toResponseBody("application/json".toMediaType())))

    @Test fun `the repository reads the plan from payments-me and treats every failure as unknown`() = runBlocking {
        val active = RealMembershipRepository(FakeApi { MyPlanDto(true, MySubscriptionDto("ACTIVE", MyPlanIdDto("promax3m"))) })
        assertEquals(PlanAccess(true, "ACTIVE", "promax3m"), active.getPlanAccess())

        val visitor = RealMembershipRepository(FakeApi { MyPlanDto(false, MySubscriptionDto("NONE", null)) })
        assertEquals(PlanAccess(false, "NONE", null), visitor.getPlanAccess())

        val off = RealMembershipRepository(FakeApi { throw notFound() })
        assertNull("SUBSCRIPTIONS_ENABLED off answers 404", off.getPlanAccess())

        val broken = RealMembershipRepository(FakeApi { throw java.io.IOException("offline") })
        assertNull(broken.getPlanAccess())
    }

    @Test fun `the ViewModel loads the plan and the screen draws only the modes it allows`() {
        fun src(p: String) = File("src/main/java/com/tappyai/app/chat/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        val vm = src("ChatViewModel.kt")
        assertTrue(vm.contains("val menuModes"))
        assertTrue(vm.contains("getPlanAccess()"))
        val screen = src("ChatScreen.kt")
        assertTrue(screen.contains("modes = menuModes"))
        assertTrue(src("ChatModeMenu.kt").contains("modes.forEach"))
    }
}
