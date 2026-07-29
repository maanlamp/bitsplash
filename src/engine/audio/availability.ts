/**
 * Whether this process has WebAudio at all, decided once at import.
 *
 * `AudioManager` builds its `AudioContext` in a field initializer, so a host
 * without WebAudio never constructs one and the `audio` service a system receives
 * is whatever stand-in that host supplied. Headless hosts — the test harness above
 * all — supply stubs that throw on **any** property access, so "is audio usable?"
 * has to be answerable without touching the service. This constant is that answer:
 * a structural fact about the platform, independent of who is holding the manager.
 *
 * Systems that make sound gate on it and skip their whole audio path when it is
 * false, which is why no ambient system needs a `try`/`catch` or a null backend.
 *
 * @example
 * if (!webAudioAvailable) {
 * 	return; // never touches ctx.audio
 * }
 */
export const webAudioAvailable = typeof AudioContext !== "undefined";
