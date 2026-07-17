package com.tappyai.core.database

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert

@Dao
interface CachedContextDao : BaseDao<CachedContextEntity> {
    @Query("SELECT * FROM cached_context WHERE userId = :userId")
    suspend fun get(userId: String): CachedContextEntity?

    /** The primary write path — context is a "latest known state per user," not an
     *  append-only log, so insert-or-replace is the natural operation. */
    @Upsert
    suspend fun upsert(entity: CachedContextEntity)

    @Query("DELETE FROM cached_context WHERE userId = :userId")
    suspend fun clear(userId: String)
}
