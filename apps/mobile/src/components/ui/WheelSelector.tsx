import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import Animated, {
  AnimatedStyle,
  clamp,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import tw from '../../lib/tw';
import * as Haptics from 'expo-haptics';
import { GAP } from '../../theme/globals';
import { LayoutChangeEvent, FlatList, StyleProp, ViewStyle, Pressable } from 'react-native';
import useDebounce from '../../hooks/useDebounce';
import { scheduleOnRN } from 'react-native-worklets';
import { View } from './view';

interface WheelSelectorItemProps<T> {
  index: number;
  item: T;
  onPress: () => void;
  scrollX: SharedValue<number>;
  renderItem: (item: T, isActive: boolean) => React.ReactNode;
  itemWidth: number;
  wheelAngle: number;
  wheelIntensity: number;
  isActive: boolean;
}

const WheelSelectorItem = <T,>({
  index,
  item,
  onPress,
  scrollX,
  renderItem,
  itemWidth,
  wheelAngle,
  wheelIntensity,
  isActive,
  ...props
}: WheelSelectorItemProps<T>) => {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [index - 1, index, index + 1];
    // const opacityRange = [0.65, 1, 0.65];

    // Calcul de l'effet wheel
    const transformations: any[] = [];

    if (wheelIntensity > 0) {
      // Calcul de la translation Y (effet de courbe)
      const translateYOffset = (itemWidth / 3) * wheelIntensity;
      const translateY = interpolate(scrollX.value, inputRange, [
        translateYOffset,
        0,
        translateYOffset,
      ]);

      // Calcul de la rotation basée sur l'angle
      const maxRotation = wheelAngle * wheelIntensity;
      const rotateZ = interpolate(scrollX.value, inputRange, [-maxRotation, 0, maxRotation]);

      transformations.push({ translateY });

      if (wheelAngle !== 0) {
        transformations.push({ rotateZ: `${rotateZ}deg` });
      }
    }

    return {
      // opacity: interpolate(scrollX.value, inputRange, opacityRange),
      transform: transformations,
    };
  }, [scrollX, index, itemWidth, wheelAngle, wheelIntensity]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable onPress={onPress}>
        <View style={[{ width: itemWidth }, tw`relative`]}>{renderItem(item, isActive)}</View>
      </Pressable>
    </Animated.View>
  );
};

export interface WheelSelectorRef {
  scrollToIndex: (index: number, animated?: boolean) => void;
  scrollToOffset: (offset: number, animated?: boolean) => void;
  getCurrentIndex: () => number;
}

interface WheelSelectorProps<T>
  extends Omit<React.ComponentProps<typeof Animated.FlatList<T>>, 'data' | 'renderItem'> {
  data: readonly T[];
  renderItem: (item: T, isActive: boolean) => React.ReactNode;
  onSelectionChange?: (item: T, index: number) => void;
  initialIndex?: number;
  enableHaptics?: boolean;
  itemWidth?: number;
  itemSpacing?: number;
  wheelAngle?: number;
  wheelIntensity?: number;
  containerStyle?: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
}

function WheelSelectorInner<T>(
  {
    data,
    renderItem: renderItemProps,
    onSelectionChange,
    keyExtractor,
    initialIndex = 0,
    enableHaptics = true,
    getItemLayout,
    horizontal = true,
    showsHorizontalScrollIndicator = false,
    itemWidth,
    itemSpacing = GAP,
    wheelAngle = 0,
    wheelIntensity = 0,
    style,
    contentContainerStyle,
    containerStyle,
    decelerationRate = 'fast',
    initialScrollIndex,
    ...props
  }: WheelSelectorProps<T>,
  ref: React.ForwardedRef<WheelSelectorRef>,
) {
  const scrollRef = useRef<FlatList>(null);
  const scrollX = useSharedValue(initialIndex);
  const activeIndex = useSharedValue(initialIndex);
  const [selectedItem, setSelectedItem] = useState<{ item: T; index: number } | null>(
    data[initialIndex] ? { item: data[initialIndex], index: initialIndex } : null,
  );
  const debouncedSelectedItem = useDebounce(selectedItem, 200);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);

  const finalItemWidth = useMemo(() => {
    return itemWidth || (containerWidth && containerWidth > 0 ? containerWidth * 0.2 : 80); // fallback width
  }, [itemWidth, containerWidth]);

  const totalItemWidth = useMemo(() => finalItemWidth + itemSpacing, [finalItemWidth, itemSpacing]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index: number, animated = true) => {
        scrollRef.current?.scrollToIndex({
          index,
          animated,
        });
      },
      scrollToOffset: (offset: number, animated = true) => {
        scrollRef.current?.scrollToOffset({
          offset,
          animated,
        });
      },
      getCurrentIndex: () => {
        return Math.round(scrollX.value);
      },
    }),
    [scrollX],
  );

  const vibrate = useCallback(() => {
    if (enableHaptics && process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [enableHaptics]);

  const onScroll = useAnimatedScrollHandler((e) => {
    'worklet';
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutation on the UI thread
    scrollX.value = clamp(e.contentOffset.x / totalItemWidth, 0, data.length - 1);
    const newActiveIndex = Math.round(scrollX.value);

    if (newActiveIndex !== activeIndex.value) {
      activeIndex.value = newActiveIndex;
      if (enableHaptics) {
        scheduleOnRN(vibrate);
      }
      scheduleOnRN(setSelectedItem, { item: data[newActiveIndex], index: newActiveIndex });
    }
  });

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width } = event.nativeEvent.layout;
      if (width !== containerWidth) {
        setContainerWidth(width);
      }
    },
    [containerWidth],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: T; index: number }) => {
      return (
        <WheelSelectorItem
          index={index}
          item={item}
          scrollX={scrollX}
          onPress={() => {
            scrollRef.current?.scrollToIndex({
              index: index,
              animated: true,
            });
          }}
          renderItem={renderItemProps}
          itemWidth={finalItemWidth}
          wheelAngle={wheelAngle}
          wheelIntensity={wheelIntensity}
          isActive={selectedItem?.index === index}
        />
      );
    },
    [finalItemWidth, scrollX, renderItemProps, wheelAngle, wheelIntensity, selectedItem],
  );

  useEffect(() => {
    if (debouncedSelectedItem && onSelectionChange) {
      onSelectionChange(debouncedSelectedItem.item, debouncedSelectedItem.index);
    }
  }, [debouncedSelectedItem, onSelectionChange]);

  return (
    <Animated.View style={[{ width: '100%' }, containerStyle]} onLayout={handleLayout}>
      {containerWidth !== undefined && (
        <Animated.FlatList
          ref={scrollRef}
          onScroll={onScroll}
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: totalItemWidth,
            offset: totalItemWidth * index,
            index,
          })}
          horizontal={horizontal}
          showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
          ItemSeparatorComponent={
            itemSpacing ? () => <View style={[{ width: itemSpacing }]} /> : null
          }
          style={[
            {
              flexGrow: 0,
              height: finalItemWidth * (1 + wheelIntensity),
            },
            style,
          ]}
          contentContainerStyle={[
            {
              // gap: itemSpacing,
              paddingLeft: (containerWidth - finalItemWidth) / 2,
              paddingRight: (containerWidth - finalItemWidth) / 2,
            },
            contentContainerStyle,
          ]}
          snapToInterval={totalItemWidth}
          decelerationRate={decelerationRate}
          {...props}
        />
      )}
    </Animated.View>
  );
}

const WheelSelector = forwardRef(WheelSelectorInner) as <T>(
  props: WheelSelectorProps<T> & { ref?: React.Ref<WheelSelectorRef> },
) => React.ReactElement;

export default WheelSelector;
