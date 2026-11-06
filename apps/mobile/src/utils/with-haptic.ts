import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';

/**
 * Fires a haptic tap, or does nothing where one isn't wanted.
 *
 * iOS only, matching the rest of the app (`AnimatedPressable`, `checkbox`,
 * `HapticTab`): Android already answers a press with its own ripple, and
 * often a system vibration, so a second buzz doubles up.
 */
export const triggerHaptic = (style: ImpactFeedbackStyle = ImpactFeedbackStyle.Light): void => {
  if (process.env.EXPO_OS !== 'ios') return;
  impactAsync(style).catch(() => undefined);
};

/**
 * Enrobe une fonction pour déclencher un retour haptique avant son exécution.
 *
 * @param callback La fonction à exécuter
 * @param style Le style du retour haptique (défaut: Light)
 */
export function withHaptic<Args extends any[], Return>(
  callback: (...args: Args) => Return,
  style: ImpactFeedbackStyle = ImpactFeedbackStyle.Light,
): (...args: Args) => Return {
  return (...args: Args): Return => {
    triggerHaptic(style);
    return callback(...args);
  };
}
