package com.tappyai.core.datastore

import kotlinx.coroutines.flow.Flow

/**
 * Generic, reactive key-value storage for simple app settings (theme choice, UI language,
 * onboarding-seen flags, etc.). Plain values only — never tokens or anything sensitive, that
 * belongs in `core:security`'s encrypted storage instead. No concrete keys are defined here;
 * each feature that needs a setting owns its own key constants and calls this contract.
 */
interface PreferencesDataSource {
    fun getString(key: String): Flow<String?>
    suspend fun setString(key: String, value: String)

    fun getBoolean(key: String): Flow<Boolean?>
    suspend fun setBoolean(key: String, value: Boolean)

    fun getInt(key: String): Flow<Int?>
    suspend fun setInt(key: String, value: Int)

    fun getLong(key: String): Flow<Long?>
    suspend fun setLong(key: String, value: Long)

    suspend fun remove(key: String)
    suspend fun clear()
}
