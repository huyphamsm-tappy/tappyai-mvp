package com.tappyai.app.navigation

import com.tappyai.core.navigation.TappyNavigator
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class NavigationModule {
    @Binds
    @Singleton
    abstract fun bindTappyNavigator(impl: TappyNavigatorImpl): TappyNavigator
}
