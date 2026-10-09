import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';

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
    impactAsync(style).catch(() => {});
    return callback(...args);
  };
}
