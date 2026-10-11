import { useTranslations } from 'use-intl';
import { Sheet } from '@lodev09/react-native-true-sheet/navigation/expo-router';
import { MapStateProvider, useMapStateValue } from './MapState';
import { INDEX_SHEET_INITIAL_DETENT } from './mapVisibleArea';
import { MapSheetHeader } from './MapSheetHeader';
import { useTheme } from '../../providers/ThemeProvider';

export const unstable_settings = {
  anchor: 'map',
};

const MapLayout = () => {
  const t = useTranslations();
  const { colors } = useTheme();
  const mapState = useMapStateValue();
  const { sheetPosition, onSheetSettled } = mapState;

  return (
    <MapStateProvider value={mapState}>
      <Sheet
        initialRouteName="map"
        screenOptions={{
          grabberOptions: {
            color: colors.muted,
          },
        }}
      >
        <Sheet.Screen name="map" />
        <Sheet.Screen
          name="index"
          options={{
            detents: [INDEX_SHEET_INITIAL_DETENT, 0.1, 0.5],
            dismissible: false,
            dimmed: false,
            grabber: false,
            reanimated: true,
            positionChangeHandler: (payload) => {
              'worklet';
              // eslint-disable-next-line react-hooks/immutability, react-compiler/react-compiler -- Reanimated shared value mutation on the UI thread
              sheetPosition.value = payload.position;
            },
          }}
          // Notifies `MapMap` whenever the sheet settles on a new detent -
          // not on every intermediate drag frame, only once the user's
          // chosen extent is final. `MapMap` itself decides what to do
          // with it (re-align the camera's padding if a tracking mode is
          // active - see where it registers `onSheetSettled`).
          listeners={{
            sheetDetentChange: () => onSheetSettled?.(),
          }}
        />
        <Sheet.Screen
          name="report"
          options={{
            detents: ['auto', 0.33, 0.5],
            dimmed: false,
            header: <MapSheetHeader title={t('pages.map.report.title')} />,
          }}
        />
        <Sheet.Screen
          name="settings"
          options={{
            detents: ['auto'],
            dimmed: false,
            header: <MapSheetHeader title={t('pages.map.settings.title')} />,
          }}
        />
      </Sheet>
    </MapStateProvider>
  );
};

export default MapLayout;
