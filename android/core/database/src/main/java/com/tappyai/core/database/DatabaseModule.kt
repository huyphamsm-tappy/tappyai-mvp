package com.tappyai.core.database

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

private const val DATABASE_NAME = "tappy.db"

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): TappyDatabase =
        Room.databaseBuilder(context, TappyDatabase::class.java, DATABASE_NAME)
            // Every entity here is a cache (see CachedContextEntity's own doc — it's re-fetched
            // from the backend, never the source of truth), so a future version bump with no
            // matching Migration should rebuild it, not crash the app on open. Without this,
            // that's exactly what Room does by default: throw IllegalStateException.
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    @Singleton
    fun provideCachedContextDao(database: TappyDatabase): CachedContextDao =
        database.cachedContextDao()
}
