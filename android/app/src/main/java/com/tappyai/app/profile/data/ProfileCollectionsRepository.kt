package com.tappyai.app.profile.data

import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.toDomain
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The self profile's collection reads the Reviews client lacks — "Đã thích" and "Đã share" — plus
 * the one write behind "Đã share". Self-only by the routes' construction: they key on the
 * bearer, never on a user id.
 */
interface ProfileCollectionsRepository {
    suspend fun getLiked(): NetworkResult<List<Review>>
    suspend fun getShared(): NetworkResult<List<Review>>

    /**
     * Persist one COMPLETED share of a review (`POST /api/reviews/{id}/share`). The success
     * boundary on Android is the chooser reporting a chosen component
     * (`Intent.EXTRA_CHOSEN_COMPONENT` from `Intent.createChooser(…, IntentSender)`); [channel]
     * is `android:<package>` of that component. Merely opening the sheet must not call this.
     * An anonymous session is refused with 403 (B17) — the caller treats that as "not recorded".
     */
    suspend fun recordShare(reviewId: String, channel: String): NetworkResult<Unit>
}

@Singleton
class RealProfileCollectionsRepository @Inject constructor(private val api: ProfileCollectionsApi) : ProfileCollectionsRepository {
    override suspend fun getLiked(): NetworkResult<List<Review>> =
        safeApiCall { api.getLiked().reviews.map { it.toDomain() } }

    override suspend fun getShared(): NetworkResult<List<Review>> =
        safeApiCall { api.getShared().reviews.map { it.toDomain() } }

    override suspend fun recordShare(reviewId: String, channel: String): NetworkResult<Unit> =
        safeApiCall {
            api.recordShare(reviewId, RecordShareRequestDto(channel = channel.take(64)))
            Unit
        }
}

@Module
@InstallIn(SingletonComponent::class)
object ProfileCollectionsNetworkModule {
    @Provides
    @Singleton
    fun provideProfileCollectionsApi(retrofit: Retrofit): ProfileCollectionsApi = retrofit.create(ProfileCollectionsApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ProfileCollectionsBindModule {
    @Binds
    @Singleton
    abstract fun bindProfileCollectionsRepository(impl: RealProfileCollectionsRepository): ProfileCollectionsRepository
}
