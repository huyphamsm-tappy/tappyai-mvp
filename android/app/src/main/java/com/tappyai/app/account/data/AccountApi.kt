package com.tappyai.app.account.data

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part

/**
 * Retrofit contract for the signed-in user's profile. Built from the shared [retrofit2.Retrofit]
 * (core:network) so the [com.tappyai.core.network.AuthInterceptor] attaches `Authorization: Bearer …`
 * automatically — all endpoints require it (401 otherwise). suspend → coroutine cancellation.
 */
interface AccountApi {

    @GET("api/profile")
    suspend fun getProfile(): ProfileDto

    @PATCH("api/profile")
    suspend fun updateProfile(@Body body: UpdateProfileRequestDto): OkResponseDto

    /** UI-language-only partial update — see [UpdateLanguageRequestDto]. */
    @PATCH("api/profile")
    suspend fun updateLanguage(@Body body: UpdateLanguageRequestDto): OkResponseDto

    /** Same endpoint as [getProfile]/[updateProfile], but a `POST` with an `avatar` multipart
     *  field — the web's `/api/profile` route branches on content-type to accept either JSON
     *  PATCH or multipart POST. Server re-validates size (≤3MB) and sniffs the real image bytes
     *  (JPEG/PNG/GIF/WebP only) regardless of what the client sends. */
    @Multipart
    @POST("api/profile")
    suspend fun uploadAvatar(@Part avatar: MultipartBody.Part): AvatarUploadResponseDto
}
