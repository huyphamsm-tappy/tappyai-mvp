package com.tappyai.app.discovery

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * State for the Discovery hub. UI-only foundation — the search field's query. Discovery is a
 * browse surface (five domain groups); personalized recommendations are a separate Home-reached
 * screen, matching the web's Explore page having no recommendation slot of its own.
 */
@HiltViewModel
class DiscoveryHubViewModel @Inject constructor() : ViewModel() {

    var query by mutableStateOf("")
        private set

    fun onQueryChange(value: String) {
        query = value
    }
}
