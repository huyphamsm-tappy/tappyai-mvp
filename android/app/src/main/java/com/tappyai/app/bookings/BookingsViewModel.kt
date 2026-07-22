package com.tappyai.app.bookings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.bookings.data.BookingsErrorMessages
import com.tappyai.app.bookings.data.BookingsRepository
import com.tappyai.app.navigation.AppRoute
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.common.ClockProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.navigation.TappyNavigator
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Bookings screen. Loads the user's bookings from `GET /api/bookings` on init and
 * exposes the result as the screen's existing [UiState] (Loading → Success/Empty/Error). The list is
 * read-only — the web bookings list has no cancel/delete (status is set by the venue).
 *
 * Review eligibility mirrors the web's own bookings page, which reads bookings *and* the user's
 * reviews and gates the button on `place_id && date < todayVN && !reviewedPlaceIds.has(place_id)`.
 * Android does the same two reads and applies [isBookingReviewable]. The reviews read is
 * best-effort: if it fails, no booking is offered a Review button rather than offering one that
 * might duplicate an existing review — the same conservative direction the web's gate takes when
 * `existingReviews` comes back null.
 */
@HiltViewModel
class BookingsViewModel @Inject constructor(
    private val repository: BookingsRepository,
    private val reviewsRepository: ReviewsRepository,
    private val navigator: TappyNavigator,
    private val clock: ClockProvider,
    private val logger: LoggerProvider,
    private val bookingsErrorMessages: BookingsErrorMessages,
) : ViewModel() {

    var uiState by mutableStateOf<UiState<List<Booking>>>(UiState.Loading)
        private set

    private var loadJob: Job? = null

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        loadJob?.cancel()
        uiState = UiState.Loading
        loadJob = viewModelScope.launch {
            when (val result = repository.getBookings()) {
                is NetworkResult.Success -> {
                    val bookings = result.data
                    uiState = if (bookings.isEmpty()) {
                        UiState.Empty
                    } else {
                        UiState.Success(bookings.withReviewEligibility(reviewedPlaceIds()))
                    }
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Bookings load failed: ${result.error}")
                    uiState = UiState.Error(bookingsErrorMessages.toUserMessage(result.error))
                }
            }
        }
    }

    /** The places this user has already reviewed — the web's `reviewedPlaceIds` set. An empty set
     *  on failure keeps every Review button hidden (see the class doc). */
    private suspend fun reviewedPlaceIds(): Set<String>? =
        when (val result = reviewsRepository.getMine()) {
            is NetworkResult.Success -> result.data.mapNotNull { it.placeId }.toSet()
            is NetworkResult.Error -> {
                logger.w(TAG, "Reviewed-places load failed, hiding Review buttons: ${result.error}")
                null
            }
        }

    private fun List<Booking>.withReviewEligibility(reviewed: Set<String>?): List<Booking> {
        if (reviewed == null) return this
        val todayVN = vietnamToday(clock.nowMillis())
        return map { booking ->
            booking.copy(
                canReview = isBookingReviewable(
                    placeId = booking.placeId,
                    rawDate = booking.rawDate,
                    todayVN = todayVN,
                    reviewedPlaceIds = reviewed,
                ),
            )
        }
    }

    /**
     * Opens the review composer with the booking's place pre-filled. The real [Booking.placeId] is
     * threaded through rather than a slug of the name (which is what the composer derives for a
     * free-text place): the web's dedupe and its per-place review lists both key on the actual
     * place id, so a slug would silently never match either.
     */
    fun onReviewBooking(booking: Booking) {
        val placeId = booking.placeId ?: return
        viewModelScope.launch {
            navigator.navigateTo(
                AppRoute.ComposerForPlace(placeId = placeId, placeName = booking.serviceName),
            )
        }
    }

    private companion object {
        const val TAG = "BookingsViewModel"
    }
}
