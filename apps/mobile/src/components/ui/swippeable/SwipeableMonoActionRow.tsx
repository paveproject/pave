import React, { ReactNode, useRef } from 'react';
import { StyleSheet, I18nManager } from 'react-native';
import { RectButton } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import Swipeable, {
  SwipeableMethods,
  SwipeDirection,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

export type ActionConfig = {
  icon?: ReactNode;
  backgroundColor?: string;
  threshold?: number;
  autoClose?: boolean;
} & ({ type: 'press'; onPress: () => void } | { type: 'open'; onOpen: () => void });

interface LeftActionProps {
  dragX: SharedValue<number>;
  swipeableRef: React.RefObject<SwipeableMethods | null>;
  config?: ActionConfig;
}

const LeftAction = ({ dragX, swipeableRef, config }: LeftActionProps) => {
  const { icon, backgroundColor = '#388e3c', threshold = 80 } = config || {};

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [0, threshold], [0, 1], Extrapolation.CLAMP),
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(dragX.value, [0, threshold], [0, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const handlePress = () => {
    swipeableRef.current?.close();
    if (config?.type === 'press') {
      config.onPress();
    } else if (config?.type === 'open') {
      config.onOpen();
    }
  };

  return (
    <RectButton style={styles.leftAction} onPress={handlePress}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor }, backgroundStyle]} />
      <Animated.View style={[styles.actionIcon, iconStyle]}>{icon}</Animated.View>
    </RectButton>
  );
};

interface RightActionProps {
  dragX: SharedValue<number>;
  swipeableRef: React.RefObject<SwipeableMethods | null>;
  config?: ActionConfig;
}

const RightAction = ({ dragX, swipeableRef, config }: RightActionProps) => {
  const { icon, backgroundColor = '#dd2c00', threshold = 40 } = config || {};

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(dragX.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  const handlePress = () => {
    swipeableRef.current?.close();
    if (config?.type === 'press') {
      config.onPress();
    } else if (config?.type === 'open') {
      config.onOpen();
    }
  };

  return (
    <RectButton style={styles.rightAction} onPress={handlePress}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor }, backgroundStyle]} />
      <Animated.View style={[styles.actionIcon, iconStyle]}>{icon}</Animated.View>
    </RectButton>
  );
};

const renderLeftActions = (
  _: any,
  progress: SharedValue<number>,
  swipeableRef: React.RefObject<SwipeableMethods | null>,
  config?: ActionConfig,
) => (config ? <LeftAction dragX={progress} swipeableRef={swipeableRef} config={config} /> : null);

const renderRightActions = (
  _: any,
  progress: SharedValue<number>,
  swipeableRef: React.RefObject<SwipeableMethods | null>,
  config?: ActionConfig,
) => (config ? <RightAction dragX={progress} swipeableRef={swipeableRef} config={config} /> : null);

interface SwipeableMonoActionRowProps extends React.ComponentProps<typeof Swipeable> {
  children?: ReactNode;
  leftAction?: ActionConfig;
  rightAction?: ActionConfig;
  friction?: number;
  enableTrackpadTwoFingerGesture?: boolean;
}

export default function SwipeableMonoActionRow({
  children,
  leftAction,
  rightAction,
  friction = 2,
  enableTrackpadTwoFingerGesture = true,
  ...props
}: SwipeableMonoActionRowProps) {
  const swipeableRow = useRef<SwipeableMethods>(null);

  const handleSwipeableOpen = (direction: SwipeDirection) => {
    if (direction === SwipeDirection.RIGHT && leftAction?.type === 'open') {
      leftAction.onOpen();
      if (leftAction.autoClose !== false) {
        swipeableRow.current?.close();
      }
    } else if (direction === SwipeDirection.LEFT && rightAction?.type === 'open') {
      rightAction.onOpen();
      if (rightAction.autoClose !== false) {
        swipeableRow.current?.close();
      }
    }
  };

  return (
    <Swipeable
      ref={swipeableRow}
      friction={friction}
      leftThreshold={leftAction?.threshold || 100}
      enableTrackpadTwoFingerGesture={enableTrackpadTwoFingerGesture}
      rightThreshold={rightAction?.threshold || 100}
      renderLeftActions={
        leftAction
          ? (_, progress) => renderLeftActions(_, progress, swipeableRow, leftAction)
          : undefined
      }
      renderRightActions={
        rightAction
          ? (_, progress) => renderRightActions(_, progress, swipeableRow, rightAction)
          : undefined
      }
      onSwipeableOpen={handleSwipeableOpen}
      {...props}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  leftAction: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexDirection: I18nManager.isRTL ? 'row' : 'row-reverse',
  },
  actionIcon: {
    width: 30,
    marginHorizontal: 10,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightAction: {
    alignItems: 'center',
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    flex: 1,
    justifyContent: 'flex-end',
  },
});
