import { Image } from 'expo-image';
import { forwardRef } from 'react';
import Animated from 'react-native-reanimated';

const ReanimatedImage = Animated.createAnimatedComponent(Image);

const AnimatedImage = forwardRef<Image, React.ComponentProps<typeof Image>>(
  ({ transition = 250, ...props }, ref) => {
    return <ReanimatedImage ref={ref} transition={transition} {...props} />;
  },
);
AnimatedImage.displayName = 'AnimatedImage';

export default AnimatedImage;
