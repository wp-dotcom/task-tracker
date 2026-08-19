const COMPLETION_SOUND_SRC = '/sounds/task-complete.mp3';

/**
 * Plays the short "task complete" chime (see public/sounds/task-complete.mp3,
 * a synthesized ~1s ascending chime — no third-party audio, so no licensing
 * question). A fresh Audio() is created per call rather than reusing one
 * shared element, so completing two tasks in quick succession (e.g. a bulk
 * complete) doesn't cut the first sound off to restart it from zero.
 *
 * play() rejects if the browser blocks the playback or the device's
 * silent/mute switch is engaged — iOS Safari in particular respects the
 * hardware mute switch for exactly this kind of short, non-media-playback
 * sound, which is the "only if audio is on" behavior wanted here. The
 * rejection is swallowed rather than surfaced, since a missed chime isn't
 * worth an error toast over.
 */
export function playCompletionSound() {
  try {
    const audio = new Audio(COMPLETION_SOUND_SRC);
    audio.volume = 0.6;
    void audio.play().catch(() => {});
  } catch {
    // Audio API unavailable for some reason (very old browser, etc.) — this
    // is a nice-to-have, not worth surfacing as an error.
  }
}
