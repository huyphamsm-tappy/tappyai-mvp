import { describe, it, expect } from 'vitest'
import { exploreVideoPipelineEnabled, videoSpeechTranscribeEnabled, videoModerationAutoRejectEnabled } from './flags'

// Both features SHIP OFF (owner 05/11/2026: "khi nào anh nói bật thì bật"). Only the exact string 'true' turns either on.
describe.each([
  ['EXPLORE_VIDEO_PIPELINE_ENABLED', exploreVideoPipelineEnabled],
  ['VIDEO_SPEECH_TRANSCRIBE_ENABLED', videoSpeechTranscribeEnabled],
  ['VIDEO_MODERATION_AUTO_REJECT_ENABLED', videoModerationAutoRejectEnabled],
] as const)('%s', (name, read) => {
  it('is off when unset', () => {
    expect(read({})).toBe(false)
  })
  it.each(['', '1', 'TRUE', 'True', 'yes', ' true', 'true ', 'on', 'false'])('stays off for %j', (v) => {
    expect(read({ [name]: v })).toBe(false)
  })
  it('is on only for the exact string true', () => {
    expect(read({ [name]: 'true' })).toBe(true)
  })
})

describe('the two flags are independent', () => {
  it('speech transcription does not follow the pipeline flag, and the pipeline does not follow speech', () => {
    expect(exploreVideoPipelineEnabled({ EXPLORE_VIDEO_PIPELINE_ENABLED: 'true' })).toBe(true)
    expect(videoSpeechTranscribeEnabled({ EXPLORE_VIDEO_PIPELINE_ENABLED: 'true' })).toBe(false)
    expect(videoSpeechTranscribeEnabled({ VIDEO_SPEECH_TRANSCRIBE_ENABLED: 'true' })).toBe(true)
    expect(exploreVideoPipelineEnabled({ VIDEO_SPEECH_TRANSCRIBE_ENABLED: 'true' })).toBe(false)
  })
})
