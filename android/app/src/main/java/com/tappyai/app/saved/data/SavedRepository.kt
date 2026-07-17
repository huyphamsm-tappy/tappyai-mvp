package com.tappyai.app.saved.data

import com.tappyai.app.saved.FavoritePlace
import com.tappyai.app.saved.SavedReview
import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the Saved library's backends. The ViewModel depends on this and the domain
 * models only — never on Retrofit/OkHttp or the DTOs. The two lists are separate calls so the
 * ViewModel can combine them (and tolerate one failing) into the screen's single Saved view.
 */
interface SavedRepository {

    suspend fun getFavorites(): NetworkResult<List<FavoritePlace>>

    suspend fun getSavedReviews(): NetworkResult<List<SavedReview>>

    /** Removes a favorite place by its place id. Returns Unit on success (`{ok:true}`). */
    suspend fun removeFavorite(placeId: String): NetworkResult<Unit>
}
