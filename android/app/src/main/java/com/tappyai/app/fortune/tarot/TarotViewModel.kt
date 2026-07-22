package com.tappyai.app.fortune.tarot

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface TarotState {
    data object Idle : TarotState
    data object Drawing : TarotState
    data class Drawn(val cards: List<DrawnCard>) : TarotState
}

@HiltViewModel
class TarotViewModel @Inject constructor() : ViewModel() {

    private val _state = MutableStateFlow<TarotState>(TarotState.Idle)
    val state: StateFlow<TarotState> = _state.asStateFlow()

    var drawCount by mutableIntStateOf(1)
        private set

    fun onDrawCountChange(count: Int) {
        drawCount = count
    }

    fun onDraw() {
        viewModelScope.launch {
            _state.value = TarotState.Drawing
            delay(DRAW_ANIMATION_MS)
            _state.value = TarotState.Drawn(cards = drawCards(drawCount))
        }
    }

    fun onReset() {
        _state.value = TarotState.Idle
    }

    private companion object {
        const val DRAW_ANIMATION_MS = 650L
    }
}
