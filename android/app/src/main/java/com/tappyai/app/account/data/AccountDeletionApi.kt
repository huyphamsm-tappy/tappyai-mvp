package com.tappyai.app.account.data

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import java.text.Normalizer
import java.util.Locale
import javax.inject.Singleton

/**
 * In-app account deletion (UAT3 P0, 2026-09-27) — the SAME server path as the web:
 * `POST /api/account/delete` → `auth.admin.deleteUser` (the operator runbook's own call); the
 * database cascades and the deletion-jobs worker remove the rest. Nothing is deleted on the device.
 *
 * Built from the shared Retrofit, so [com.tappyai.core.network.AuthInterceptor] attaches the
 * user's `Authorization: Bearer …` — the route resolves the same identity the web's cookie does.
 *
 * Contract (src/app/api/account/delete/route.ts): 200 ok · 400 confirm_required · 401 no session ·
 * 403 anonymous · 404 not_available (flag off) · 409 staff_account · 500 delete_failed.
 */
interface AccountDeletionApi {
    /** `flags.accountSelfDelete` — whether this deployment offers the in-app deletion at all. */
    @GET("api/config")
    suspend fun config(): DeletionConfigDto

    @POST("api/account/delete")
    suspend fun deleteAccount(@Body body: DeleteAccountRequestDto): Response<OkResponseDto>
}

@Serializable
data class DeletionConfigDto(val flags: DeletionFlagsDto = DeletionFlagsDto())

@Serializable
data class DeletionFlagsDto(val accountSelfDelete: Boolean = false)

@Serializable
data class DeleteAccountRequestDto(val confirm: String)

/** The typed word, accepted in either language and both Vietnamese tone placements — as the web. */
private val CONFIRM_WORDS = setOf("XÓA", "XOÁ", "DELETE").map { Normalizer.normalize(it, Normalizer.Form.NFC) }.toSet()

fun isDeleteConfirmWord(input: String): Boolean =
    Normalizer.normalize(input.trim(), Normalizer.Form.NFC).uppercase(Locale.ROOT) in CONFIRM_WORDS

/** What the server answered, mapped to what the screen can say. */
enum class DeleteOutcome { Deleted, Staff, SignIn, NotAvailable, Failed }

fun deleteOutcomeFor(status: Int): DeleteOutcome = when (status) {
    in 200..299 -> DeleteOutcome.Deleted
    409 -> DeleteOutcome.Staff
    401, 403 -> DeleteOutcome.SignIn
    404 -> DeleteOutcome.NotAvailable
    else -> DeleteOutcome.Failed
}

@Module
@InstallIn(SingletonComponent::class)
object AccountDeletionModule {
    @Provides
    @Singleton
    fun provideAccountDeletionApi(retrofit: Retrofit): AccountDeletionApi = retrofit.create(AccountDeletionApi::class.java)
}
