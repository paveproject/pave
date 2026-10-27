import { useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useTranslations } from 'use-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReportType } from '@libs/api-js';
import { createReport } from '../../lib/watermelon/reports';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocation } from '../../providers/LocationProvider';
import { useModalHeaderOptions } from '../../hooks/useModalHeaderOptions';
import { isAndroid } from '../../platform/detection';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/Button';
import { Icons as LegacyIcons } from '../../constants/IconsOld';
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

const Report = () => {
  const router = useRouter();
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const toast = useToast();
  const { position } = useLocation();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const navigationHeaderHeight = useHeaderHeight();

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
        <View style={tw`flex-1 items-center justify-start gap-1 p-2`}>
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
    <>
      <Stack.Screen options={isAndroid ? { headerShown: false } : modalHeaderOptions} />
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
            icon={LegacyIcons.X}
            onPress={() => router.dismiss()}
            style={tw`rounded-full`}
          />
          <View pointerEvents="none" style={tw`items-center justify-center absolute inset-0`}>
            <Text variant="title" numberOfLines={1}>
              {t('pages.map.report.title')}
            </Text>
          </View>
        </View>
      )}
      <LegendList
        data={REPORT_TYPES}
        numColumns={SCREEN_WIDTH < Breakpoints.md ? 3 : SCREEN_WIDTH < Breakpoints.lg ? 4 : 6}
        keyExtractor={(type) => type}
        renderItem={renderItem}
        contentContainerStyle={{
          gap: theme.spaces.md,
          paddingHorizontal: theme.spaces.horizontal,
          // On iOS the native header stays shown (just a transparent
          // `headerLeft` close button via `modalHeaderOptions`), so the
          // list needs top padding to clear it - on Android it's hidden
          // (`headerShown: false`, the custom row above draws its own),
          // so `navigationHeaderHeight` is already 0 there.
          paddingTop: navigationHeaderHeight + theme.spaces.vertical,
          paddingBottom: insets.bottom + theme.spaces.vertical,
        }}
      />
    </>
  );
};

export default Report;
