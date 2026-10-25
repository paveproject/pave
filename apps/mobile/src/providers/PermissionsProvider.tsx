import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { LocationManager } from '@maplibre/maplibre-react-native';
import * as Notifications from 'expo-notifications';
import { useCameraPermissions } from 'expo-camera';
import { requestBluetoothPermission } from 'munim-bluetooth';
import { logger } from '../logger';
import { usePermissionsStore } from '../stores/usePermissionsStore';
import type { PermissionHandle, PermissionId, PermissionStatus } from '../lib/permissions/types';

type PermissionsContextProps = Record<PermissionId, PermissionHandle>;

const PermissionsContext = createContext<PermissionsContextProps | undefined>(undefined);

/**
 * Single owner of every OS permission the app asks about. Bluetooth has
 * no check-only probe (the installed `munim-bluetooth` package only
 * exposes `requestBluetoothPermission`, which both requests AND checks -
 * see its own doc comment), so its status only ever changes via an
 * explicit `request()` call (onboarding's switch, or a row tap in
 * `settings/permissions.tsx`) - calling it blind on every mount would
 * risk firing a real OS prompt the very first time a user ever opens
 * the app. Once a decision has already been made at least once, though,
 * calling it again is always prompt-free (same "doubles as a check"
 * behavior), so `usePermissionsStore`'s `bluetoothEverRequested` flag is
 * what lets this refresh the real status silently on every subsequent
 * launch instead of showing a stale "not asked" for a permission the
 * user actually already granted (or denied) in a previous session.
 * Location/Notifications/Camera all have genuine check-only APIs, so
 * they're already safe to refresh silently on mount and whenever the
 * app returns to the foreground, no such flag needed.
 */
export const PermissionsProvider = ({ children }: { children: React.ReactNode }) => {
  const [bluetoothStatus, setBluetoothStatus] = useState<PermissionStatus>('undetermined');
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>('undetermined');
  const [notificationsStatus, setNotificationsStatus] = useState<PermissionStatus>('undetermined');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const bluetoothEverRequested = usePermissionsStore((state) => state.bluetoothEverRequested);

  const requestBluetooth = useCallback(async (): Promise<boolean> => {
    usePermissionsStore.getState().setBluetoothEverRequested(true);
    try {
      const granted = await requestBluetoothPermission(['scan', 'connect', 'advertise']);
      setBluetoothStatus(granted ? 'granted' : 'denied');
      return granted;
    } catch (error) {
      logger.error('permissions: bluetooth request failed', { error });
      setBluetoothStatus('denied');
      return false;
    }
  }, []);

  useEffect(() => {
    if (bluetoothEverRequested) {
      // Fetch-on-mount; `requestBluetooth` sets state after awaiting, same
      // justification as `recovery-keys.tsx`'s `reload`.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      requestBluetooth();
    }
  }, [bluetoothEverRequested, requestBluetooth]);

  // `requestPermissions()` is safe to call repeatedly - once the OS has a
  // decision, both platforms just return it instead of re-prompting - so
  // it doubles as the check, run silently on mount and whenever the app
  // comes back from Settings/background.
  const refreshLocation = useCallback(async (): Promise<boolean> => {
    const granted = await LocationManager.requestPermissions();
    setLocationStatus(granted ? 'granted' : 'denied');
    return granted;
  }, []);

  const refreshNotifications = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationsStatus(status);
  }, []);

  const requestNotifications = useCallback(async (): Promise<boolean> => {
    const { status } = await Notifications.requestPermissionsAsync();
    setNotificationsStatus(status);
    return status === 'granted';
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        refreshLocation();
        refreshNotifications();
      }
    };
    handleAppStateChange('active');

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [refreshLocation, refreshNotifications]);

  const requestCamera = useCallback(async (): Promise<boolean> => {
    const response = await requestCameraPermission();
    return response.status === 'granted';
  }, [requestCameraPermission]);

  const value = useMemo<PermissionsContextProps>(
    () => ({
      bluetooth: { status: bluetoothStatus, request: requestBluetooth },
      location: { status: locationStatus, request: refreshLocation },
      notifications: { status: notificationsStatus, request: requestNotifications },
      camera: { status: cameraPermission?.status ?? 'undetermined', request: requestCamera },
    }),
    [
      bluetoothStatus,
      requestBluetooth,
      locationStatus,
      refreshLocation,
      notificationsStatus,
      requestNotifications,
      cameraPermission,
      requestCamera,
    ],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};

export const usePermissions = () => {
  const context = use(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};
