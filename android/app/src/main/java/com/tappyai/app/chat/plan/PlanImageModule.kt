package com.tappyai.app.chat.plan

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/** [PlanImageApi] from the shared singleton [Retrofit] (core:network), like every other API. */
@Module
@InstallIn(SingletonComponent::class)
object PlanImageModule {
    @Provides
    @Singleton
    fun providePlanImageApi(retrofit: Retrofit): PlanImageApi = retrofit.create(PlanImageApi::class.java)
}

/** The plan card is drawn deep inside chat message rows; it reaches the singleton repository here. */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface PlanImageEntryPoint {
    fun planImages(): PlanImageRepository
}

fun planImageRepository(context: Context): PlanImageRepository =
    EntryPointAccessors.fromApplication(context.applicationContext, PlanImageEntryPoint::class.java).planImages()
