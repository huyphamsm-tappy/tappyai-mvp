package com.tappyai.core.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import java.io.IOException
import javax.inject.Inject

/** Default [PreferencesDataSource] over Jetpack DataStore. Bound via [DataStoreModule]. */
class DataStorePreferencesDataSource @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) : PreferencesDataSource {

    /**
     * `DataStore.data` throws [IOException] through the flow if the underlying file can't be
     * read (corruption, disk error) — Google's own DataStore guidance is to catch that and
     * degrade to an empty [Preferences] rather than let it crash every collector. Any other
     * exception still propagates; this is not a blanket catch-all.
     */
    private val data: Flow<Preferences> = dataStore.data.catch { cause ->
        if (cause is IOException) emit(emptyPreferences()) else throw cause
    }

    override fun getString(key: String): Flow<String?> =
        data.map { it[stringPreferencesKey(key)] }.distinctUntilChanged()

    override suspend fun setString(key: String, value: String) {
        dataStore.edit { it[stringPreferencesKey(key)] = value }
    }

    override fun getBoolean(key: String): Flow<Boolean?> =
        data.map { it[booleanPreferencesKey(key)] }.distinctUntilChanged()

    override suspend fun setBoolean(key: String, value: Boolean) {
        dataStore.edit { it[booleanPreferencesKey(key)] = value }
    }

    override fun getInt(key: String): Flow<Int?> =
        data.map { it[intPreferencesKey(key)] }.distinctUntilChanged()

    override suspend fun setInt(key: String, value: Int) {
        dataStore.edit { it[intPreferencesKey(key)] = value }
    }

    override fun getLong(key: String): Flow<Long?> =
        data.map { it[longPreferencesKey(key)] }.distinctUntilChanged()

    override suspend fun setLong(key: String, value: Long) {
        dataStore.edit { it[longPreferencesKey(key)] = value }
    }

    override suspend fun remove(key: String) {
        // The caller's `key` carries no type information here, so all four possible typed
        // keys are removed — DataStore no-ops removing a key that isn't present, so this is
        // safe even though at most one of the four ever actually existed.
        dataStore.edit { prefs ->
            prefs.remove(stringPreferencesKey(key))
            prefs.remove(booleanPreferencesKey(key))
            prefs.remove(intPreferencesKey(key))
            prefs.remove(longPreferencesKey(key))
        }
    }

    override suspend fun clear() {
        dataStore.edit { it.clear() }
    }
}
