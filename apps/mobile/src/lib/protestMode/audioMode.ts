import { setAudioModeAsync } from 'expo-audio';

/**
 * `setAudioModeAsync` *merges*, so whatever the last caller set stays set: a
 * recording leaves the session in `playAndRecord`, and playback has to claim
 * its own mode rather than inherit it. With no mode ever set at all, iOS uses
 * a category the ring switch silences - playback then has no output.
 */
export const setRecordingAudioMode = () =>
  setAudioModeAsync({
    allowsRecording: true,
    allowsBackgroundRecording: true,
    interruptionMode: 'duckOthers',
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  });

export const setPlaybackAudioMode = () =>
  setAudioModeAsync({
    allowsRecording: false,
    allowsBackgroundRecording: false,
    interruptionMode: 'doNotMix',
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });
