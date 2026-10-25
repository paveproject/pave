import { createContext, use, useCallback } from 'react';
import { useCurrentPosition, type GeolocationPosition } from '@maplibre/maplibre-react-native';
import { useTranslations } from 'use-intl';
import { useToast } from '../components/Toast';
import { usePermissions } from './PermissionsProvider';

type LocationContextProps = {
  position: GeolocationPosition | undefined;
  hasPermission: boolean | undefined;
  requestPermission: () => Promise<boolean>;
};

type LocationProviderProps = {
  children: React.ReactNode;
};

const LocationContext = createContext<LocationContextProps | undefined>(undefined);

/**
 * App-wide location access. Permission request/status is owned by
 * `PermissionsProvider` (above this in the tree) - this provider only
 * adds the actual live position, backed by MapLibre's own
 * `LocationManager`/`useCurrentPosition()`, the same native location
 * source `UserLocation` and the map screens use.
 */
export const LocationProvider = ({ children }: LocationProviderProps) => {
  const t = useTranslations();
  const toast = useToast();
  const position = useCurrentPosition();
  const location = usePermissions().location;

  const requestPermission = useCallback(async () => {
    const granted = await location.request();
    if (!granted) {
      toast.error(t('messages.location_denied'));
    }
    return granted;
  }, [location, toast, t]);

  return (
    <LocationContext.Provider
      value={{
        position,
        hasPermission: location.status === 'granted',
        requestPermission,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = use(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};
