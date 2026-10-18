import { ReactNode, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { IconName } from '@expo/ui';
import { Host, Icon as NativeIcon } from '@expo/ui';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '../../../providers/ThemeProvider';
import { extractStyleKeys } from '../../../utils/extract-style-keys';
import { Text } from '../text';
import { AnimatedPressable } from '../AnimatedPressable';
import tw from '../../../lib/tw';

interface OpenRowHandle {
  close: () => void;
}
const openRows = new Set<OpenRowHandle>();

function closeOtherRows(self: OpenRowHandle) {
  for (const row of openRows) {
    if (row !== self) row.close();
  }
}

export interface SwipeAction {
  label: string;
  /** Platform-native icon (SF Symbol / Material Symbol) - see `constants/icons.ts`. */
  icon: IconName;
  onPress: () => void;
  /** @default colors.destructive */
  iconColor?: {
    color: string;
    backgroundColor: string;
  };
  labelStyle?: {
    color?: string;
  };
  /** Final, fully-revealed width of this action. @default 76 */
  width?: number;
}

interface SwipeableActionsRowProps {
  children: ReactNode;
  /** Right-side actions, revealed as the row is swiped LEFT - the first
   * one (closest to the edge) reaches its own full width before the next
   * one starts growing. */
  actionsRight?: SwipeAction[];
  /** Left-side actions, revealed as the row is swiped RIGHT - same
   * growth order as `actionsRight`, just mirrored. */
  actionsLeft?: SwipeAction[];
  style?: ViewStyle;
  /** Corner radius the row settles into once the swipe has started. @default 14 */
  borderRadius?: number;
}

const DEFAULT_ACTION_WIDTH = 76;
// Tuned to match `react-native-gesture-handler`'s own Swipeable (ReanimatedSwipeable.tsx) -
// a stiff, non-bouncy spring that still inherits the release velocity (passed
// in per-call below) so it continues naturally in the direction of the swipe
// instead of restarting from a standstill.
const SPRING_CONFIG = { mass: 2, damping: 1000, stiffness: 700, overshootClamping: true };
// Same trick as that component's `DRAG_TOSS`: a fast, short flick doesn't
// travel far enough to cross the open/close threshold on distance alone, so
// a slice of the release velocity is folded into the decision as if the
// drag had kept going for a brief moment after the finger lifted.
const DRAG_TOSS = 0.05;
// UIKit's own rubber-banding formula (f(x,d,c) = x*d*c / (d+c*x)) - lets
// the row keep moving (with resistance) past its fully-open position
// instead of hard-stopping there, so a hard/continued swipe once every
// action is already visible still "gives" a little before springing back
// to the open position on release. `OVERSHOOT_DIMENSION` is the asymptotic
// cap on how far that resisted travel can stretch, however hard the drag.
const OVERSHOOT_DIMENSION = 40;
const OVERSHOOT_CONSTANT = 0.55;
// Fraction of a side's total width the drag has to cross (distance-wise,
// before the velocity toss above is even added) for it to count as "open"
// on release. Lower than half so a lighter swipe is enough to commit.
const OPEN_THRESHOLD_FRACTION = 0.35;
// A fast release gets a little bump past wherever it's settling (open or
// closed, either direction) even if the drag itself never physically
// overshot that point - below this velocity there's no bump at all, it
// scales up to `CONTENT_BUMP_MAX_DISTANCE` (px) by the top of the range.
const CONTENT_BUMP_VELOCITY_RANGE = [300, 1400];
const CONTENT_BUMP_MAX_DISTANCE = 16;

function rubberBand(overshoot: number) {
  'worklet';
  return (
    (overshoot * OVERSHOOT_DIMENSION * OVERSHOOT_CONSTANT) /
    (OVERSHOOT_DIMENSION + OVERSHOOT_CONSTANT * overshoot)
  );
}

// Shared geometry for one side's action list: how wide the whole group is
// (incl. the edge inset and the gaps between actions), and where each
// individual action starts being uncovered, measured from that side's edge.
// An empty side must resolve to a total width of exactly 0 (not just the
// edge inset) - otherwise that inset alone gives the gesture a small but
// real distance to settle "open" into, with nothing in it to show.
function getSideGeometry(sideActions: SwipeAction[], edgeInset: number, gap: number) {
  if (sideActions.length === 0) {
    return { widths: [], totalWidth: 0, revealStarts: [] };
  }
  const widths = sideActions.map((action) => action.width ?? DEFAULT_ACTION_WIDTH);
  const totalWidth =
    widths.reduce((sum, width) => sum + width, 0) +
    gap * Math.max(0, sideActions.length - 1) +
    edgeInset;
  const revealStarts = widths.map((_, index) => {
    const widthsBefore = widths.slice(0, index).reduce((sum, width) => sum + width, 0);
    return edgeInset + widthsBefore + gap * index;
  });
  return { widths, totalWidth, revealStarts };
}

/**
 * iOS Mail/Notes-style swipeable row: a muted, rounded backdrop fades in
 * the instant the swipe starts, and each action in `actionsRight`/
 * `actionsLeft` pops in (small -> full size, with a velocity-dependent
 * little bump once it settles) one after another as the row keeps sliding.
 */
export const SwipeableActionsRow = ({
  children,
  actionsRight = [],
  actionsLeft = [],
  style,
  borderRadius: borderRadiusProp,
}: SwipeableActionsRowProps) => {
  const { colors, theme } = useTheme();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const velocityX = useSharedValue(0);
  const borderRadius = borderRadiusProp ?? theme.border.radius['2xl'];

  const { extracted: contentPadding, restStyle: containerStyle } = extractStyleKeys(style, [
    'paddingHorizontal',
    'paddingLeft',
    'paddingRight',
  ]);
  // Each action layer is absolutely positioned behind the content, so it
  // doesn't automatically inherit the content's own horizontal padding -
  // without this, the outermost action on either side would sit flush
  // against the screen edge instead of matching the margin the swiped
  // item has everywhere else.
  const rightEdgeInset =
    (typeof contentPadding.paddingRight === 'number' ? contentPadding.paddingRight : undefined) ??
    (typeof contentPadding.paddingHorizontal === 'number'
      ? contentPadding.paddingHorizontal
      : undefined) ??
    0;
  const leftEdgeInset =
    (typeof contentPadding.paddingLeft === 'number' ? contentPadding.paddingLeft : undefined) ??
    (typeof contentPadding.paddingHorizontal === 'number'
      ? contentPadding.paddingHorizontal
      : undefined) ??
    0;

  const gap = theme.spaces.sm;
  const right = getSideGeometry(actionsRight, rightEdgeInset, gap);
  const left = getSideGeometry(actionsLeft, leftEdgeInset, gap);

  // Whether the muted/rounded backdrop should be showing - unlike the
  // original version, this doesn't track the swipe distance at all. It
  // shows the moment a touch lands (even a plain press-and-release that
  // never turns into a swipe) and only hides once the gesture concludes on
  // a closed result - so while actively dragging, or once open, it stays
  // fully visible regardless of direction.
  const backgroundVisible = useSharedValue(0);
  // What the background's final visible/hidden state should resolve to
  // once the gesture concludes - written in `onEnd`, read in `onFinalize`.
  // `onEnd` only fires for a gesture that actually activated (crossed
  // `activeOffsetX`); a plain press-and-release never does, so the only
  // handler guaranteed to always run - activated or not - is `onFinalize`.
  // Resolving the background there (instead of in `onEnd`) is what lets it
  // show immediately on press without ever getting stuck visible after a
  // tap that never turned into a swipe.
  const pendingOpenTarget = useSharedValue(0);

  const close = () => {
    translateX.value = withSpring(0, SPRING_CONFIG);
    pendingOpenTarget.value = 0;
    backgroundVisible.value = withTiming(0, { duration: theme.animations.durations.sm });
  };

  // Kept fresh every render (via the effect below) so the registry always
  // calls the CURRENT `close` - reading `.current` here would happen during
  // render, which refs don't allow; the effect is the only safe place to
  // write to it.
  const latestCloseRef = useRef(close);
  useEffect(() => {
    latestCloseRef.current = close;
  });

  // A stable identity for this row's lifetime, created once via lazy state
  // initialization (not a ref) so it's safe to read during render.
  const [self] = useState<OpenRowHandle>(() => ({ close: () => latestCloseRef.current() }));
  useEffect(() => {
    openRows.add(self);
    return () => {
      openRows.delete(self);
    };
  }, [self]);
  // Zero-arg on purpose - `self` is a JS-thread object holding a function,
  // which can't cross over as a `scheduleOnRN` argument from the UI-thread
  // worklet below. Closing over it here instead keeps it JS-thread-only;
  // the worklet only ever needs to say "run this", not pass data into it.
  const notifyOpened = () => {
    closeOtherRows(self);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      startX.value = translateX.value;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutation
      backgroundVisible.value = withTiming(1, { duration: theme.animations.durations.xl });
    })
    .onUpdate((event) => {
      const raw = startX.value + event.translationX;
      if (raw < -right.totalWidth) {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutation
        translateX.value = -right.totalWidth - rubberBand(-right.totalWidth - raw);
      } else if (raw > left.totalWidth) {
        translateX.value = left.totalWidth + rubberBand(raw - left.totalWidth);
      } else {
        translateX.value = raw;
      }
      velocityX.value = event.velocityX;
    })
    .onEnd((event) => {
      // Project the drag a little further in the direction it was moving
      // before deciding - this is what lets a quick short flick still
      // cross the threshold, instead of requiring the full half-width of
      // distance regardless of speed.
      const tossedTranslate = translateX.value + DRAG_TOSS * event.velocityX;
      let target = 0;
      if (tossedTranslate < 0 && -tossedTranslate > right.totalWidth * OPEN_THRESHOLD_FRACTION) {
        target = -right.totalWidth;
      } else if (
        tossedTranslate > 0 &&
        tossedTranslate > left.totalWidth * OPEN_THRESHOLD_FRACTION
      ) {
        target = left.totalWidth;
      }
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutation
      pendingOpenTarget.value = target;
      if (target !== 0) {
        scheduleOnRN(notifyOpened);
      }

      const bumpDistance = interpolate(
        Math.abs(event.velocityX),
        CONTENT_BUMP_VELOCITY_RANGE,
        [0, CONTENT_BUMP_MAX_DISTANCE],
        Extrapolation.CLAMP,
      );
      if (bumpDistance > 0) {
        // Same idea as the action buttons' own bump: a quick push a little
        // further than the resting point, then a clean spring back to it -
        // instead of relying on the settle spring's own (clamped) overshoot,
        // which by design never goes past its target.
        const bumpTarget = target + Math.sign(event.velocityX) * bumpDistance;
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutation
        translateX.value = withSequence(
          withTiming(bumpTarget, { duration: 90 }),
          withSpring(target, SPRING_CONFIG),
        );
      } else {
        translateX.value = withSpring(target, { ...SPRING_CONFIG, velocity: event.velocityX });
      }
    })
    .onFinalize(() => {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutation
      backgroundVisible.value = withTiming(pendingOpenTarget.value !== 0 ? 1 : 0, {
        duration: theme.animations.durations.sm,
      });
    });

  const translateStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backgroundStyle = useAnimatedStyle(() => {
    const revealed = backgroundVisible.value;
    return {
      borderRadius: revealed * borderRadius,
      backgroundColor: interpolateColor(revealed, [0, 1], [colors.background, colors.muted]),
    };
  });

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={[styles.actionsLeft, { gap, paddingLeft: leftEdgeInset }]}>
        {actionsLeft.map((action, index) => (
          <SwipeActionButton
            key={index}
            action={action}
            translateX={translateX}
            velocityX={velocityX}
            direction={1}
            revealStart={left.revealStarts[index]}
            onPress={() => {
              action.onPress();
              close();
            }}
          />
        ))}
      </View>
      <View style={[styles.actionsRight, { gap, paddingRight: rightEdgeInset }]}>
        {actionsRight
          .map((action, index) => ({ action, index }))
          .reverse()
          .map(({ action, index }) => (
            <SwipeActionButton
              key={index}
              action={action}
              translateX={translateX}
              velocityX={velocityX}
              direction={-1}
              revealStart={right.revealStarts[index]}
              onPress={() => {
                action.onPress();
                close();
              }}
            />
          ))}
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={translateStyle}>
          <Animated.View
            style={[styles.contentBackground, { left: gap, right: gap }, backgroundStyle]}
          />
          <View style={contentPadding}>{children}</View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const PILL_HEIGHT = 28;
// Swipe velocity (px/s) range the bump scales across - unlike before, there's
// no "below this, no bump at all" floor: even a near-zero velocity still gets
// the tiny `MIN_BUMP_SCALE` below, it just never grows past it.
const BUMP_VELOCITY_RANGE = [0, 1400];
// Always-visible floor for the bump, however slow the swipe.
const MIN_BUMP_SCALE = 1.015;
// Fraction of the available vertical padding headroom the bump is allowed
// to actually use at top velocity - keeps it subtle even at its largest.
const BUMP_INTENSITY = 0.3;
// A real finger rarely crosses a single pixel boundary cleanly - it wobbles
// a few px either side of it while dragging, which (with just one threshold)
// re-fired the bump on every wobble, cancelling and restarting its
// animation mid-flight. This margin creates two separate thresholds instead:
// crossing `revealEnd + margin` fires the bump and disarms it; only
// retracting back past `revealEnd - margin` re-arms it for next time.
const BUMP_ARM_MARGIN = 6;

const SwipeActionButton = ({
  action,
  translateX,
  velocityX,
  direction,
  revealStart,
  onPress,
}: {
  action: SwipeAction;
  translateX: SharedValue<number>;
  velocityX: SharedValue<number>;
  /** 1 for a left-side action (uncovered by +translateX), -1 for a
   * right-side one (uncovered by -translateX). */
  direction: 1 | -1;
  revealStart: number;
  onPress: () => void;
}) => {
  const { colors, theme } = useTheme();
  const width = action.width ?? DEFAULT_ACTION_WIDTH;
  const revealEnd = revealStart + width;

  const verticalPadding = theme.spaces.sm;
  const maxBumpScale = 1 + ((verticalPadding * 2) / PILL_HEIGHT) * BUMP_INTENSITY;
  const bumpScale = useSharedValue(1);
  // Whether the bump is currently eligible to fire again - see
  // BUMP_ARM_MARGIN above for why this needs two thresholds instead of one.
  const armed = useSharedValue(true);

  useAnimatedReaction(
    () => direction * translateX.value,
    (uncoveredPos) => {
      'worklet';
      if (armed.value && uncoveredPos >= revealEnd + BUMP_ARM_MARGIN) {
        armed.value = false;
        const bump = interpolate(
          Math.abs(velocityX.value),
          BUMP_VELOCITY_RANGE,
          [MIN_BUMP_SCALE, maxBumpScale],
          Extrapolation.CLAMP,
        );
        bumpScale.value = withSequence(
          withTiming(bump, { duration: 90 }),
          withSpring(1, { damping: 12, stiffness: 220 }),
        );
      } else if (!armed.value && uncoveredPos <= revealEnd - BUMP_ARM_MARGIN) {
        armed.value = true;
      }
    },
  );

  const style = useAnimatedStyle(() => {
    const uncovered = direction * translateX.value - revealStart;
    const scale = interpolate(uncovered, [width / 2, width], [0, 1], Extrapolation.CLAMP);
    const opacity = interpolate(uncovered, [width * 0.7, width], [0, 1], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale: scale * bumpScale.value }],
    };
  });

  return (
    <View style={[styles.actionSlot, { width }]}>
      <AnimatedPressable onPress={onPress} style={tw`w-full`}>
        <Animated.View style={[styles.actionContent, { paddingVertical: verticalPadding }, style]}>
          <View
            style={[
              styles.actionPill,
              { backgroundColor: action.iconColor?.backgroundColor ?? colors.destructive },
            ]}
          >
            <Host style={{ width: theme.icons.sizes.sm, height: theme.icons.sizes.sm }}>
              <NativeIcon
                name={action.icon}
                size={theme.icons.sizes.sm}
                color={action.iconColor?.color ?? colors.destructiveForeground}
              />
            </Host>
          </View>
          <Text
            style={[
              styles.actionLabel,
              { color: action.labelStyle?.color ?? colors.mutedForeground },
            ]}
            numberOfLines={1}
          >
            {action.label}
          </Text>
        </Animated.View>
      </AnimatedPressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  contentBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  actionsRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    flexDirection: 'row',
  },
  actionsLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
  },
  actionSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionPill: {
    width: '100%',
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 11,
  },
});
