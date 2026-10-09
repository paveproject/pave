import { FlashList, FlashListProps, FlashListRef } from '@shopify/flash-list';
import Animated from 'react-native-reanimated';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as <T>(
  props: FlashListProps<T> & { ref?: React.Ref<FlashListRef<T>> },
) => React.ReactElement;

export default AnimatedFlashList;
