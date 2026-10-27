import { useCallback, useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import SegmentedControl from '@expo/ui/community/segmented-control';
import { useTranslations } from 'use-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore, type MapStyleVariant } from '../stores/useUIStore';
import { useTheme } from '../providers/ThemeProvider';
import { useModalHeaderOptions } from '../hooks/useModalHeaderOptions';
import { isAndroid } from '../platform/detection';
import { View } from '../components/ui/view';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/Button';
import { Icons as LegacyIcons } from '../constants/IconsOld';
import tw from '../lib/tw';

const MAP_STYLE_VARIANTS: MapStyleVariant[] = ['default', 'satellite'];

/**
 * Root-level `/settings-map` formSheet (the map's style toggle), header-
 * managed the same way as `screens/report/Report.tsx`/`app/auth/index.tsx`.
 */
const SettingsMap = () => {
  const t = useTranslations();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const mapStyleVariant = useUIStore((state) => state.map.style);
  const setMapStyle = useUIStore((state) => state.setMapStyle);
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const navigationHeaderHeight = useHeaderHeight();

  const values = useMemo(
    () => MAP_STYLE_VARIANTS.map((style) => t(`pages.map.settings.styles.${style}`)),
    [t],
  );

  const handleChange = useCallback(
    (event: { nativeEvent: { selectedSegmentIndex: number } }) => {
      setMapStyle(MAP_STYLE_VARIANTS[event.nativeEvent.selectedSegmentIndex]);
    },
    [setMapStyle],
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
              {t('pages.map.settings.title')}
            </Text>
          </View>
        </View>
      )}
      <View
        style={{
          paddingHorizontal: theme.spaces.horizontal,
          paddingTop: navigationHeaderHeight + theme.spaces.vertical,
          paddingBottom: insets.bottom + theme.spaces.vertical,
        }}
      >
        <SegmentedControl
          values={values}
          selectedIndex={MAP_STYLE_VARIANTS.indexOf(mapStyleVariant)}
          onChange={handleChange}
          tintColor={colors.primary}
        />
      </View>
    </>
  );
};

export default SettingsMap;
