package com.tappyai.app.account.data

import com.tappyai.app.account.AccountProfile
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [AccountRepository]. Both calls go through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working. DTO→domain mapping happens here.
 */
@Singleton
class RealAccountRepository @Inject constructor(
    private val api: AccountApi,
) : AccountRepository {

    override suspend fun getProfile(): NetworkResult<AccountProfile> =
        safeApiCall { api.getProfile().toDomain() }

    override suspend fun updateProfile(fullName: String, bio: String): NetworkResult<Unit> =
        safeApiCall {
            api.updateProfile(UpdateProfileRequestDto(fullName = fullName, bio = bio))
            Unit
        }

    override suspend fun updateLanguage(languageTag: String): NetworkResult<Unit> =
        safeApiCall {
            api.updateLanguage(UpdateLanguageRequestDto(language = languageTag))
            Unit
        }

    override suspend fun uploadAvatar(bytes: ByteArray, mimeType: String): NetworkResult<String> =
        safeApiCall {
            val body = bytes.toRequestBody(mimeType.toMediaType())
            val part = MultipartBody.Part.createFormData("avatar", "avatar", body)
            api.uploadAvatar(part).avatarUrl
        }
}
