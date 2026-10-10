import { Sheet } from '@lodev09/react-native-true-sheet/navigation/expo-router';
import { useTheme } from '../../providers/ThemeProvider';

/**
 * Without this, Expo Router never registers `map` as this layout's anchor/
 * entry point (see `getRoutesCore.js`'s `crawlAndAppendInitialRoutesAndEntryFiles`
 * - it only sets `initialRouteName`/pushes an entry point when
 * `unstable_settings.anchor` is present), so landing on the bare `/map` URL
 * resolves straight to `index` with `map` never injected underneath it. The
 * `initialRouteName` prop on `<Sheet>` below only configures our router's own
 * internal default - it doesn't feed Expo Router's route-tree resolution.
 */
export const unstable_settings = {
  anchor: 'map',
};

/**
 * `map` is the Sheet navigator's base route - TrueSheet always renders
 * whichever route is declared first as plain full-screen content, and every
 * other route as an actual floating sheet (confirmed against a previously
 * working True-Sheet-over-a-map setup: `map` first with no options, `index`
 * and `report` after with `dimmed: false` so the map stays touchable under
 * them, same as the iOS Maps app's own sheet).
 */
const MapLayout = () => {
  const { theme } = useTheme();
  const cornerRadius = theme.border.radius['2xl'];

  return (
    <Sheet initialRouteName="map">
      <Sheet.Screen name="map" />
      <Sheet.Screen
        name="index"
        options={{
          detents: ['auto'],
          dismissible: false,
          dimmed: false,
          grabber: false,
          cornerRadius,
        }}
      />
      <Sheet.Screen name="report" options={{ detents: ['auto'], dimmed: false, cornerRadius }} />
    </Sheet>
  );
};

export default MapLayout;
