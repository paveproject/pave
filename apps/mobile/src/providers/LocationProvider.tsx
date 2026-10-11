import { createContext, use, useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  LocationManager,
  useCurrentPosition,
  type GeolocationPosition,
} from '@maplibre/maplibre-react-native';
import { useTranslations } from 'use-intl';
import { useToast } from '../components/Toast';

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
 * App-wide location access, backed by MapLibre's own `LocationManager` -
 * already a dependency, and the same native location source `UserLocation`
 * and the map screens use, so there's no second permission/location stack
 * to keep in sync.
 */
export const LocationProvider = ({ children }: LocationProviderProps) => {
  const t = useTranslations();
  const toast = useToast();
  const position = useCurrentPosition();
  const [hasPermission, setHasPermission] = useState<boolean | undefined>(undefined);

  // `requestPermissions()` is safe to call repeatedly - once the OS has a
  // decision, both platforms just return it instead of re-prompting - so it
  // doubles as the permission check, run silently on mount and whenever the
  // app comes back from Settings/background.
  const refreshPermission = useCallback(async () => {
    const granted = await LocationManager.requestPermissions();
    setHasPermission(granted);
    return granted;
  }, []);

  const requestPermission = useCallback(async () => {
    const granted = await refreshPermission();
    if (!granted) {
      toast.error(t('messages.location_denied'));
    }
    return granted;
  }, [refreshPermission, toast, t]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        refreshPermission();
      }
    };
    handleAppStateChange('active');

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => subscription.remove();
  }, [refreshPermission]);

  return (
    <LocationContext.Provider value={{ position, hasPermission, requestPermission }}>
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
