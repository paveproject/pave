import { useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useWindowDimensions, type ImageRequireSource } from 'react-native';
import { Image } from 'expo-image';
import { useTranslations } from 'use-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LegendList } from '@legendapp/list/react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useModalHeaderOptions } from '../../hooks/useModalHeaderOptions';
import { isAndroid } from '../../platform/detection';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/Button';
import { Icons as LegacyIcons } from '../../constants/IconsOld';
import tw from '../../lib/tw';
import { Breakpoints } from '../../constants/breakpoints';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';

interface ReportSheetGridProps<T extends string> {
  title: string;
  items: readonly T[];
  icon: (item: T) => ImageRequireSource;
  label: (item: T) => string;
  onSelect: (item: T) => void;
  /**
   * Android only, and only for the in-content row: iOS gets the native header,
   * where `useModalHeaderOptions` already swaps the close X for a back chevron
   * once the nested stack is past index 0.
   */
  leading?: 'close' | 'back';
}

/**
 * Both steps of the report sheet are the same grid over different items, so
 * the sheet chrome (the native header on iOS, the drawn row on Android) and
 * the column maths live here once.
 */
export const ReportSheetGrid = <T extends string>({
  title,
  items,
  icon,
  label,
  onSelect,
  leading = 'close',
}: ReportSheetGridProps<T>) => {
  const router = useRouter();
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const modalHeaderOptions = useModalHeaderOptions();
  const navigationHeaderHeight = useHeaderHeight();

  // Deliberately no `aspect-square` on the cell: at three columns it is ~114pt
  // wide, so 8pt padding + a 64pt icon + a 4pt gap leaves ~30pt for the label -
  // under the ~40pt two lines of FONT_SIZE 16 need. The square used to win,
  // because `Text` carries `flexShrink: 1` globally and this column's main axis
  // is vertical, so Yoga squeezed the label to one line rather than overflow.
  const renderItem = useCallback(
    ({ item }: { item: T }) => (
      <AnimatedPressable onPress={() => onSelect(item)}>
        <View style={tw`flex-1 items-center justify-start gap-1 p-2`}>
          <Image
            source={icon(item)}
            style={{ width: theme.icons.sizes['2xl'], height: theme.icons.sizes['2xl'] }}
            contentFit="contain"
          />
          <Text style={tw`text-center`} numberOfLines={2}>
            {label(item)}
          </Text>
        </View>
      </AnimatedPressable>
    ),
    [icon, label, onSelect, theme.icons.sizes],
  );

  return (
    <>
      <Stack.Screen
        options={isAndroid ? { headerShown: false } : { title, ...modalHeaderOptions }}
      />
      {isAndroid && (
        <View
          style={[
            tw`flex-row items-center`,
            {
              paddingTop: theme.spaces.sm,
              paddingBottom: theme.spaces.sm,
              paddingLeft: insets.left + theme.spaces.horizontal,
              paddingRight: insets.right + theme.spaces.horizontal,
            },
          ]}
        >
          <Button
            variant="muted"
            size="icon"
            icon={leading === 'back' ? LegacyIcons.ChevronLeft : LegacyIcons.X}
            onPress={() => (leading === 'back' ? router.back() : router.dismiss())}
            accessibilityLabel={leading === 'back' ? t('messages.back') : t('messages.cancel')}
            style={tw`rounded-full`}
          />
          <View pointerEvents="none" style={tw`items-center justify-center absolute inset-0`}>
            <Text variant="title" numberOfLines={1}>
              {title}
            </Text>
          </View>
        </View>
      )}
      <LegendList
        data={items as T[]}
        numColumns={SCREEN_WIDTH < Breakpoints.md ? 3 : SCREEN_WIDTH < Breakpoints.lg ? 4 : 6}
        keyExtractor={(item) => item}
        renderItem={renderItem}
        contentContainerStyle={{
          gap: theme.spaces.md,
          paddingHorizontal: theme.spaces.horizontal,
          paddingTop: navigationHeaderHeight + theme.spaces.vertical,
          paddingBottom: insets.bottom + theme.spaces.vertical,
        }}
      />
    </>
  );
};
