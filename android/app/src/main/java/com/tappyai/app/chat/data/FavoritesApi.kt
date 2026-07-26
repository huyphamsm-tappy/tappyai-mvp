package com.tappyai.app.chat.data

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.POST
import javax.inject.Singleton

/**
 * `POST /api/favorites` — save a place to the user's favorites, the Chat "Save place" affordance
 * (web `SavePlaceButton`, `ChatInterface.tsx`). The GET/DELETE side lives in maps/data; this is the
 * write the chat flow needs.
 */
interface FavoritesApi {
    @POST("api/favorites")
    suspend fun addFavorite(@Body body: AddFavoriteRequestDto): Response<Unit>
}

/** Web body: `{ placeId: "manual_<ts>", placeName, placeAddress: "", placeType: "saved" }`. */
@Serializable
data class AddFavoriteRequestDto(
    val placeId: String,
    val placeName: String,
    val placeAddress: String = "",
    val placeType: String = "saved",
)

@Module
@InstallIn(SingletonComponent::class)
object FavoritesModule {
    @Provides
    @Singleton
    fun provideFavoritesApi(retrofit: Retrofit): FavoritesApi = retrofit.create(FavoritesApi::class.java)
}
