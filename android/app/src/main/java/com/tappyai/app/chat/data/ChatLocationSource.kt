package com.tappyai.app.chat.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The device's LAST KNOWN position for a chat turn, or null.
 *
 * `/api/chat` reads `userLocation {lat, lng}` and, with it, centres the search on the phone
 * (BUG-011 D2: rows carry `distance_km`, "gần đây" means near you). The web sends the browser's
 * geolocation the same way; Android sent nothing, so its cards never showed a distance.
 *
 * Deliberately cheap: no fix is requested and nothing waits — the framework's cached location
 * from GPS or network is used if the user granted either location permission, otherwise null,
 * which the server treats exactly as before (no bias, destination-centred). The permission
 * prompt itself is the screen's job ([com.tappyai.app.chat.ChatScreen]); this reads only.
 */
@Singleton
class ChatLocationSource @Inject constructor(@ApplicationContext private val context: Context) {

    fun granted(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun lastKnown(): UserLocationDto? {
        if (!granted()) return null
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        val best = try {
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
                .mapNotNull { p -> runCatching { lm.getLastKnownLocation(p) }.getOrNull() }
                .maxByOrNull { it.time }
        } catch (_: SecurityException) { null } ?: return null
        // A stale fix (older than 6 hours) is not "where you are".
        if (System.currentTimeMillis() - best.time > STALE_MS) return null
        return UserLocationDto(lat = best.latitude, lng = best.longitude)
    }

    private companion object { const val STALE_MS = 6 * 60 * 60 * 1000L }
}
