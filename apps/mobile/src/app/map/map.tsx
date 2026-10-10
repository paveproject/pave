import { Map, Camera, UserLocation } from '@maplibre/maplibre-react-native';

const MAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

const DEFAULT_CENTER: [number, number] = [2.3522, 48.8566];

/**
 * The Sheet navigator's base route (see `_layout.tsx`) - declared first, so
 * it's the one TrueSheet renders plain/full-screen, with `index` and
 * `report` floating over it as actual sheets.
 */
const MapScreen = () => {
  return (
    <Map mapStyle={MAP_STYLE_URL} style={{ flex: 1 }}>
      <Camera initialViewState={{ center: DEFAULT_CENTER, zoom: 12 }} />
      <UserLocation />
    </Map>
  );
};

export default MapScreen;
