package com.tappyai.app.servicedetail

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.servicedetail.data.CreateBookingRequestDto
import com.tappyai.app.servicedetail.data.ServiceDetailRepository
import com.tappyai.core.common.ClockProvider
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject

/**
 * State for the service-detail screen + its booking form — mirrors the web `/service/[id]` page
 * and its `BookingForm`. Reads its immutable [info] from nav args, loads the community reviews and
 * the user's past bookings for this service, and holds the mutable booking-form fields. Submitting
 * POSTs `api/bookings` and flips to a confirmation state, exactly like the web (which then
 * auto-navigates back — left to the screen here).
 */
@HiltViewModel
class ServiceDetailViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val repository: ServiceDetailRepository,
    private val stringProvider: StringProvider,
    private val clock: ClockProvider,
    private val logger: LoggerProvider,
) : ViewModel() {

    val info = ServiceInfo(
        serviceId = savedStateHandle.get<String>("serviceId").orEmpty(),
        name = savedStateHandle.get<String>("name").orEmpty(),
        address = savedStateHandle.get<String>("address").orEmpty(),
        type = savedStateHandle.get<String>("type").orEmpty(),
        placeId = savedStateHandle.get<String>("placeId").orEmpty(),
    )

    private val _reviewsState = MutableStateFlow<UiState<ServiceReviews>>(UiState.Loading)
    val reviewsState: StateFlow<UiState<ServiceReviews>> = _reviewsState.asStateFlow()

    private val _myBookings = MutableStateFlow<List<MyBooking>>(emptyList())
    val myBookings: StateFlow<List<MyBooking>> = _myBookings.asStateFlow()

    // ── Booking form fields (mirror BookingForm's useState) ──────────────────────
    // Each field's starting value is restored from SavedStateHandle (which — unlike a plain
    // ViewModel property — survives process death, not just a config change) and every setter
    // mirrors the new value back into it, so a user mid-way through filling this form never loses
    // it to a low-memory background kill. Nav args above use the same handle read-only; these are
    // the handle's own mutable slots.
    var date by mutableStateOf(savedStateHandle.get<String>(KEY_DATE).orEmpty())
        private set
    var time by mutableStateOf(savedStateHandle.get<String>(KEY_TIME).orEmpty())
        private set
    var guests by mutableStateOf(savedStateHandle.get<Int>(KEY_GUESTS) ?: 2)
        private set
    var name by mutableStateOf(savedStateHandle.get<String>(KEY_NAME).orEmpty())
        private set
    var phone by mutableStateOf(savedStateHandle.get<String>(KEY_PHONE).orEmpty())
        private set
    var notes by mutableStateOf(savedStateHandle.get<String>(KEY_NOTES).orEmpty())
        private set
    var isSubmitting by mutableStateOf(false)
        private set
    var done by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set

    /** Today in Việt Nam (UTC+7), `yyyy-MM-dd` — the booking date floor, matching the web. */
    val todayVN: String = Instant.ofEpochMilli(clock.nowMillis())
        .atZone(ZoneId.ofOffset("", ZoneOffset.ofHours(7)))
        .toLocalDate()
        .format(DateTimeFormatter.ISO_LOCAL_DATE)

    init {
        loadReviews()
        loadMyBookings()
    }

    private fun loadReviews() {
        _reviewsState.value = UiState.Loading
        viewModelScope.launch {
            _reviewsState.value = when (val r = repository.getReviews(info.placeId)) {
                is NetworkResult.Success -> UiState.Success(r.data)
                is NetworkResult.Error -> {
                    logger.w(TAG, "Reviews load failed: ${r.error}")
                    // Reviews are a supplementary section — a failure just hides it (empty), never
                    // an error screen, matching the web (which renders the section only when present).
                    UiState.Success(ServiceReviews(emptyList(), null))
                }
            }
        }
    }

    private fun loadMyBookings() {
        viewModelScope.launch {
            when (val r = repository.getMyBookings(info.serviceId)) {
                is NetworkResult.Success -> _myBookings.value = r.data
                is NetworkResult.Error -> logger.w(TAG, "My-bookings load failed: ${r.error}")
            }
        }
    }

    fun onDateChange(value: String) { date = value; savedStateHandle[KEY_DATE] = value }
    fun onTimeToggle(slot: String) {
        time = if (time == slot) "" else slot
        savedStateHandle[KEY_TIME] = time
    }
    fun onGuestsChange(delta: Int) {
        guests = (guests + delta).coerceIn(1, 20)
        savedStateHandle[KEY_GUESTS] = guests
    }
    fun onNameChange(value: String) { name = value; savedStateHandle[KEY_NAME] = value }
    fun onPhoneChange(value: String) { phone = value; savedStateHandle[KEY_PHONE] = value }
    fun onNotesChange(value: String) { notes = value; savedStateHandle[KEY_NOTES] = value }

    fun onSubmit() {
        if (isSubmitting) return
        // Same required fields the web validates: date, name, phone.
        if (date.isBlank() || name.isBlank() || phone.isBlank()) {
            errorMessage = stringProvider.get(R.string.service_booking_error_required)
            return
        }
        errorMessage = null
        isSubmitting = true
        viewModelScope.launch {
            val result = repository.createBooking(
                CreateBookingRequestDto(
                    serviceId = info.serviceId,
                    serviceName = info.name,
                    serviceType = info.type,
                    date = date,
                    time = time,
                    guests = guests,
                    name = name,
                    phone = phone,
                    notes = notes,
                    placeId = info.placeId.takeIf { it.isNotBlank() },
                ),
            )
            isSubmitting = false
            when (result) {
                is NetworkResult.Success -> done = true
                is NetworkResult.Error -> {
                    logger.e(TAG, "Booking submit failed: ${result.error}")
                    errorMessage = stringProvider.get(R.string.service_booking_error_generic)
                }
            }
        }
    }

    private companion object {
        const val TAG = "ServiceDetailViewModel"
        const val KEY_DATE = "booking_date"
        const val KEY_TIME = "booking_time"
        const val KEY_GUESTS = "booking_guests"
        const val KEY_NAME = "booking_name"
        const val KEY_PHONE = "booking_phone"
        const val KEY_NOTES = "booking_notes"
    }
}
