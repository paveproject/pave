import { forwardRef } from 'react';
import Animated, { AnimatedScrollViewProps } from 'react-native-reanimated';

const AnimatedContentContainer = forwardRef<Animated.ScrollView, AnimatedScrollViewProps>(
  ({ children, contentContainerStyle, ...rest }, ref) => {
    return (
      <Animated.ScrollView {...rest} ref={ref}>
        <Animated.View style={contentContainerStyle}>{children}</Animated.View>
      </Animated.ScrollView>
    );
  },
);
AnimatedContentContainer.displayName = 'AnimatedContentContainer';

export default AnimatedContentContainer;
