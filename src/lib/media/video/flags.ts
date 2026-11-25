// Switches of the Explore video work. BOTH SHIP OFF (owner 05/11/2026: "khi nào anh nói bật thì bật"): a flag is on only when it is exactly the string 'true',
// unset or anything else means off. Nothing reads them yet; the code that will gate on them lands in the later parts of the plan.

type Env = Readonly<Record<string, string | undefined>>

/** Master switch of the new video pipeline (private source, transcoding, moderation before publishing). */
export function exploreVideoPipelineEnabled(env: Env = process.env): boolean {
  return env.EXPLORE_VIDEO_PIPELINE_ENABLED === 'true'
}

/** Speech-to-text of a clip's audio (the speech is then moderated as text). Independent of the pipeline switch; needs AI consent. */
export function videoSpeechTranscribeEnabled(env: Env = process.env): boolean {
  return env.VIDEO_SPEECH_TRANSCRIBE_ENABLED === 'true'
}

/**
 * AUTOMATED clip moderation (owner 25/11/2026: there is no human reviewer): ON unless the value is exactly 'false'. The clip's frames, speech and overlay text are judged by the Vietnam-law
 * filter (src/lib/safety/autoModeration) instead of a third-party endpoint, and every case that would have waited for a person is closed by the machine (rejected). Needs
 * VIDEO_SPEECH_TRANSCRIBE_ENABLED=true: a clip with sound whose speech cannot be read is rejected, never approved.
 */
export function videoModerationAutomatedEnabled(env: Env = process.env): boolean {
  return (env.VIDEO_MODERATION_AUTOMATED ?? '').trim().toLowerCase() !== 'false'
}

/** Lets the moderation step REJECT a clear, non-severe violation without a person. Off by default: until the owner says so, the AI can only approve or send to review. */
export function videoModerationAutoRejectEnabled(env: Env = process.env): boolean {
  return env.VIDEO_MODERATION_AUTO_REJECT_ENABLED === 'true'
}
