import { Platform } from 'react-native';
import { Button, type ButtonProps } from '@expo/ui';
import {
  Button as ComposeButton,
  Text as ComposeText,
  type ButtonContentPadding,
} from '@expo/ui/jetpack-compose';
import type { ModifierConfig } from '@expo/ui/jetpack-compose/modifiers';

export interface NativeButtonColors {
  /** Background of the button itself. */
  containerColor?: string;
  /** Color applied to the label/icon by the platform (RN children set their
   *  own color and ignore this). */
  contentColor?: string;
}

export interface NativeButtonProps extends Omit<ButtonProps, 'modifiers' | 'variant'> {
  /**
   * Colors of the filled button. On iOS these have to be expressed as
   * `tint(...)` / `foregroundStyle(...)` in `iosModifiers` instead - SwiftUI
   * has no equivalent prop.
   */
  colors?: NativeButtonColors;
  /** SwiftUI modifiers, iOS only. */
  iosModifiers?: ModifierConfig[];
  /** Jetpack Compose modifiers, Android only - layout only, see `colors`. */
  androidModifiers?: ModifierConfig[];
  /** Material3 content padding, Android only (`style` is the iOS equivalent). */
  androidContentPadding?: ButtonContentPadding;
}

/**
 * Filled native button, platform-split because the two sides disagree on
 * where a custom background color belongs.
 *
 * iOS takes it as a `tint(...)` modifier, so it goes straight through
 * `@expo/ui`'s universal `Button` with whatever `iosModifiers` the caller
 * passes.
 *
 * Android can't: the universal `Button` only forwards modifiers, and
 * `@expo/ui` hands those to the Material3 `Button`'s *outer* `modifier`
 * chain - outside the `Surface` that carries the shape. A
 * `background(color)` modifier there paints a square behind the pill (the
 * color bleeding past the rounded corners) while the pill itself keeps the
 * theme's default container color. So Android goes through the Compose
 * button directly for its `colors` prop, which the `Surface` draws: it
 * follows `ButtonDefaults.shape` and the ripple.
 *
 * Omitted colors fall back to the Material3 defaults (`Color.Unspecified`
 * on the native side), including the disabled ones.
 */
export const NativeButton = ({
  children,
  label,
  onPress,
  disabled,
  colors,
  iosModifiers,
  androidModifiers,
  androidContentPadding,
  ...rest
}: NativeButtonProps) => {
  if (Platform.OS !== 'android') {
    return (
      <Button
        variant="filled"
        label={label}
        onPress={onPress}
        disabled={disabled}
        modifiers={iosModifiers}
        {...rest}
      >
        {children}
      </Button>
    );
  }

  return (
    <ComposeButton
      onClick={disabled ? undefined : onPress}
      enabled={!disabled}
      colors={colors}
      contentPadding={androidContentPadding}
      modifiers={androidModifiers}
    >
      {children ?? <ComposeText>{label ?? ''}</ComposeText>}
    </ComposeButton>
  );
};
