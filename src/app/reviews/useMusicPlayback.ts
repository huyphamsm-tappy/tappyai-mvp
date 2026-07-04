'use client'

import { useSyncExternalStore } from 'react'
import { musicPlaybackController, type MusicPlaybackState } from './musicPlaybackController'

// Reactive read of the shared playback controller's state. Any number of
// ReviewMusicCard instances can call this and each independently derive
// "is my key the one playing" — no prop-drilling of playback state needed.
export function useMusicPlayback(): MusicPlaybackState {
  return useSyncExternalStore(
    musicPlaybackController.subscribe.bind(musicPlaybackController),
    musicPlaybackController.getState.bind(musicPlaybackController),
    musicPlaybackController.getState.bind(musicPlaybackController)
  )
}
