package com.tappyai.app.servicedetail

import com.tappyai.app.servicedetail.data.CreateBookingRequestDto
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the JSON Android POSTs to `api/bookings` against the exact body the web `BookingForm` sends
 * (`JSON.stringify({ serviceId, serviceName, serviceType, date, time, guests, name, phone, notes,
 * placeId })`), field name and order included. The backend reads these by name and a rename would
 * fail only at runtime as a booking that silently never lands.
 */
class ServiceDetailWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `booking body matches the web POST shape`() {
        val body = CreateBookingRequestDto(
            serviceId = "pho-ha-noi",
            serviceName = "Phở Hà Nội",
            serviceType = "food",
            date = "2026-07-20",
            time = "19:00",
            guests = 2,
            name = "Nguyễn Văn A",
            phone = "0900000000",
            notes = "Bàn gần cửa sổ",
            placeId = "ChIJabc123",
        )

        assertEquals(
            """{"serviceId":"pho-ha-noi","serviceName":"Phở Hà Nội","serviceType":"food","date":"2026-07-20","time":"19:00","guests":2,"name":"Nguyễn Văn A","phone":"0900000000","notes":"Bàn gần cửa sổ","placeId":"ChIJabc123"}""",
            json.encodeToString(body),
        )
    }

    /** The web sends `placeId: placeId || null` — a missing placeId must serialize as JSON null. */
    @Test
    fun `booking body serializes a null placeId`() {
        val body = CreateBookingRequestDto(
            serviceId = "spa-x",
            serviceName = "Spa X",
            serviceType = "spa",
            date = "2026-07-20",
            time = "",
            guests = 1,
            name = "A",
            phone = "09",
            notes = "",
            placeId = null,
        )

        assertEquals(
            """{"serviceId":"spa-x","serviceName":"Spa X","serviceType":"spa","date":"2026-07-20","time":"","guests":1,"name":"A","phone":"09","notes":"","placeId":null}""",
            json.encodeToString(body),
        )
    }
}
