import { useCallback, useMemo } from 'react';
import SegmentedControl from '@expo/ui/community/segmented-control';
import { useTranslations } from 'use-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore, type MapStyleVariant } from '../../stores/useUIStore';
import { useTheme } from '../../providers/ThemeProvider';
import { View } from '../../components/ui/view';

const MAP_STYLE_VARIANTS: MapStyleVariant[] = ['default', 'satellite'];

const MapSettings = () => {
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const mapStyleVariant = useUIStore((state) => state.map.style);
  const setMapStyle = useUIStore((state) => state.setMapStyle);

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
    <View
      style={{
        padding: theme.spaces.horizontal,
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
  );
};

export default MapSettings;
