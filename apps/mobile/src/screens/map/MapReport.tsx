import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';
import { Button, Host, RNHostView } from '@expo/ui';
import { buttonBorderShape, buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { clip, fillMaxSize, Shapes } from '@expo/ui/jetpack-compose/modifiers';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useTranslations } from 'use-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReportType } from '@libs/api-js';
import { createReport } from '../../lib/watermelon/reports';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocation } from '../../providers/LocationProvider';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { Assets } from '../../constants/assets';
import tw from '../../lib/tw';
import { Breakpoints } from '../../constants/breakpoints';
import { LegendList } from '@legendapp/list/react-native';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';

const REPORT_TYPES: ReportType[] = [
  'tear_gas',
  'police_presence',
  'arrest',
  'violence',
  'road_block',
  'medical',
  'water_cannon',
  'kettling',
  'other',
];

/**
 * `createReport` never throws (see `lib/watermelon/reports.ts`) - the
 * report is already durably saved locally the instant this resolves,
 * regardless of whether the push to the API behind it succeeded or will
 * have to be retried on reconnect. So this screen only has one real failure
 * case to handle: no location yet.
 */
const MapReport = () => {
  const router = useRouter();
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const toast = useToast();
  const { position } = useLocation();
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  // Expands the native button to fill whatever size its `Host` is given
  // (the Host itself is sized by the outer `aspect-square` View via
  // flex: 1 - a native button otherwise shrinks to its content), liquid
  // glass on iOS (falls back to a plain bordered look below iOS 26, same
  // as the other native buttons in this app), and square-ish rounded
  // corners (`theme.border.radius.xl`) instead of the default capsule/full
  // rounding on either platform.
  const tileButtonModifiers =
    Platform.OS === 'ios'
      ? [
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          buttonStyle('glass'),
          buttonBorderShape('roundedRectangle', theme.border.radius.xl),
        ]
      : [fillMaxSize(), clip(Shapes.RoundedCorner(theme.border.radius.xl))];

  const handleSelect = useCallback(
    async (type: ReportType) => {
      if (!position) {
        toast.error(t('pages.map.report.no_location'));
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await createReport({
        type,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      toast.success(t('pages.map.report.created'));
      router.back();
    },
    [position, router, toast, t],
  );

  const renderItem = useCallback(
    ({ item: type }: { item: ReportType }) => (
      <AnimatedPressable onPress={() => handleSelect(type)} style={[tw`aspect-square`]}>
        <View style={tw`flex-1 items-center justify-center gap-1 p-2`}>
          <Image
            source={Assets.reports[type]}
            style={{ width: theme.icons.sizes.lg, height: theme.icons.sizes.lg }}
            contentFit="contain"
          />
          <Text style={tw`text-center`} numberOfLines={2}>
            {t(`pages.map.report.types.${type}`)}
          </Text>
        </View>
      </AnimatedPressable>
    ),
    [handleSelect, t, theme.icons.sizes.lg],
  );

  return (
    <LegendList
      data={REPORT_TYPES}
      numColumns={SCREEN_WIDTH < Breakpoints.md ? 3 : SCREEN_WIDTH < Breakpoints.lg ? 4 : 6}
      keyExtractor={(type) => type}
      renderItem={renderItem}
      contentContainerStyle={{
        gap: theme.spaces.md,
        paddingHorizontal: theme.spaces.horizontal,
      }}
    />
  );
};

export default MapReport;
