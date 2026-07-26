package com.tappyai.app.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tappyai.core.logging.LoggerProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/** A device location for chat bias / Nearby / For-You — mirrors the web `{lat,lng,address?}`. */
data class UserLocation(val lat: Double, val lng: Double, val address: String?)

/**
 * Device location via Google Play Services' FusedLocationProvider — the capability the app was
 * missing entirely. Coarse permission is enough (matches the web's use of an approximate location
 * for bias). Everything degrades gracefully: no permission, no Play Services, or a geocoder with no
 * backend all just yield null (or a null address), never a crash.
 */
@Singleton
class LocationRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val logger: LoggerProvider,
) {
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(context) }

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** Best-effort current location; null when unavailable (no permission / no fix / error). */
    @SuppressLint("MissingPermission")
    suspend fun currentLocation(): UserLocation? {
        if (!hasPermission()) return null
        val location = try {
            lastOrCurrent()
        } catch (e: Exception) {
            logger.w(TAG, "Location fetch failed: ${e.message}")
            null
        } ?: return null
        return UserLocation(location.latitude, location.longitude, reverseGeocode(location.latitude, location.longitude))
    }

    @SuppressLint("MissingPermission")
    private suspend fun lastOrCurrent(): Location? {
        awaitTask(fused.lastLocation)?.let { return it }
        return awaitTask(fused.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, null))
    }

    private suspend fun <T> awaitTask(task: com.google.android.gms.tasks.Task<T>): T? =
        suspendCancellableCoroutine { cont: CancellableContinuation<T?> ->
            task.addOnSuccessListener { if (cont.isActive) cont.resume(it) }
                .addOnFailureListener { if (cont.isActive) cont.resume(null) }
                .addOnCanceledListener { if (cont.isActive) cont.resume(null) }
        }

    private suspend fun reverseGeocode(lat: Double, lng: Double): String? = withContext(Dispatchers.IO) {
        if (!Geocoder.isPresent()) return@withContext null
        try {
            @Suppress("DEPRECATION")
            val results = Geocoder(context, Locale.getDefault()).getFromLocation(lat, lng, 1)
            results?.firstOrNull()?.let { it.locality ?: it.subAdminArea ?: it.adminArea }
        } catch (e: Exception) {
            logger.w(TAG, "Reverse geocode failed: ${e.message}")
            null
        }
    }

    private companion object {
        const val TAG = "LocationRepository"
    }
}
