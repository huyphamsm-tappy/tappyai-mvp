package com.tappyai.core.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

private const val PREFERENCES_FILE_NAME = "tappy_preferences"
private val Context.tappyPreferencesDataStore: DataStore<Preferences> by preferencesDataStore(
    name = PREFERENCES_FILE_NAME,
)

@Module
@InstallIn(SingletonComponent::class)
abstract class DataStoreModule {
    @Binds
    @Singleton
    abstract fun bindPreferencesDataSource(impl: DataStorePreferencesDataSource): PreferencesDataSource

    companion object {
        @Provides
        @Singleton
        fun provideDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            context.tappyPreferencesDataStore
    }
}
