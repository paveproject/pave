import { StyleSheet, View, FlatList, ViewToken, Platform } from 'react-native';
import React from 'react';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedRef,
} from 'react-native-reanimated';
import Pagination from './components/Pagination';
import CustomButton from './components/CustomButton';
import RenderItem from './components/RenderItem';
import useOnboardingData, { OnboardingData } from './data';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PADDING_VERTICAL } from '../../theme/globals';
import { useRouter } from 'expo-router';

const OnboardingScreen = () => {
  const flatListRef = useAnimatedRef<FlatList<OnboardingData>>();
  const x = useSharedValue(0);
  const flatListIndex = useSharedValue(0);
  const data = useOnboardingData();
  const router = useRouter();
  const shouldInsetsAware = !(Platform.OS === 'ios' && router.canDismiss());
  const insets = useSafeAreaInsets();

  const onViewableItemsChanged = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      flatListIndex.value = viewableItems[0].index;
    }
  };

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      x.value = event.contentOffset.x;
    },
  });

  return (
    <View style={styles.container}>
      <Animated.FlatList
        ref={flatListRef}
        onScroll={onScroll}
        data={data}
        renderItem={({ item, index }) => {
          return <RenderItem item={item} index={index} x={x} />;
        }}
        keyExtractor={(item) => item.id.toString()}
        scrollEventThrottle={16}
        horizontal={true}
        bounces={false}
        pagingEnabled={true}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          minimumViewTime: 300,
          viewAreaCoveragePercentThreshold: 10,
        }}
        style={{
          paddingTop: shouldInsetsAware ? insets.top + PADDING_VERTICAL : PADDING_VERTICAL,
          paddingBottom: insets.bottom + PADDING_VERTICAL + 50,
        }}
      />
      <View style={styles.bottomContainer}>
        <Pagination data={data} x={x} />
        <CustomButton flatListRef={flatListRef} flatListIndex={flatListIndex} x={x} data={data} />
      </View>
    </View>
  );
};

export default OnboardingScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bottomContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 30,
    paddingVertical: 30,
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
  },
});
