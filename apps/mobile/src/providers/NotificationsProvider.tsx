import { createContext, use, useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthProvider';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/Toast';
import {
  devicesOptions,
  pendingActionsOptions,
  recoveryRequestCurrentOptions,
  trustedContactsOptions,
  usePushTokenUpdateMutation,
} from '@libs/query-client';
import { useTranslations } from 'use-intl';
import type { PushContent } from '@libs/api-js';

type NotificationsContextType = {
  permissionStatus: Notifications.PermissionStatus | null;
  pushToken: string | null;
  notifications: Notifications.Notification[] | null;
  error?: Error | null;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export const useNotifications = () => {
  const ctx = use(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used in NotificationsProvider');
  return ctx;
};

export const NotificationsProvider = ({ children }: { children: React.ReactNode }) => {
  const toast = useToast();
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, pushToken, setPushToken } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus | null>(
    null,
  );
  const [notifications, setNotifications] = useState<Notifications.Notification[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const notificationsListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const { mutate: updatePushToken } = usePushTokenUpdateMutation();

  const handleRegisterForPushNotificationsAsync = useCallback(async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      setPermissionStatus(finalStatus);
      if (finalStatus !== 'granted') {
        throw new Error('Permission not granted to get push token for push notification!');
      }
      try {
        // Raw native token (FCM registration token on Android, APNs device
        // token on iOS) - sent straight to our own API/notify, not through
        // Expo's push service (throttled, and we already run FCM/APNs
        // credentials elsewhere), so no EAS project id needed here.
        const pushTokenString = (await Notifications.getDevicePushTokenAsync()).data;
        return pushTokenString;
      } catch (e) {
        throw new Error(`${e}`);
      }
    } else {
      throw new Error('Must use physical device for push notifications');
    }
  }, []);

  /**
   * Keeps the react-query cache honest the moment a push actually tells us
   * something changed server-side - same events `useUserEventsSocket`
   * reacts to live over the websocket, but that's only connected while the
   * app is foregrounded. A push is the only signal left once it isn't (or
   * once a query that matters, e.g. `recoveryRequestCurrentOptions` on
   * `settings/recovery`, isn't even mounted to pick up a focus refetch) -
   * without this, e.g. `recovery-request:ready` would leave the "recovery
   * in progress" screen stuck showing stale data until something else
   * happened to refetch it. Runs on *every* receipt (foreground or not),
   * not just a tap - `data.kind` is the only thing read here, so this
   * never needs updating when a new field is added to a variant, only
   * when a whole new kind is.
   */
  const invalidateForNotification = useCallback(
    (data: PushContent) => {
      switch (data.kind) {
        case 'trusted-contact-accepted':
          queryClient.invalidateQueries({ queryKey: trustedContactsOptions().queryKey });
          break;
        case 'recovery-request-created':
          queryClient.invalidateQueries({ queryKey: pendingActionsOptions().queryKey });
          break;
        case 'recovery-request-contact-responded':
        case 'recovery-request-ready':
        case 'recovery-request-failed':
          queryClient.invalidateQueries({ queryKey: recoveryRequestCurrentOptions().queryKey });
          break;
        case 'device-approval-requested':
          queryClient.invalidateQueries({ queryKey: pendingActionsOptions().queryKey });
          queryClient.invalidateQueries({ queryKey: devicesOptions().queryKey });
          break;
        case 'device-approved':
        case 'device-declined':
          queryClient.invalidateQueries({ queryKey: pendingActionsOptions().queryKey });
          queryClient.invalidateQueries({ queryKey: devicesOptions().queryKey });
          queryClient.invalidateQueries({ queryKey: recoveryRequestCurrentOptions().queryKey });
          break;
        default:
          data satisfies never;
      }
    },
    [queryClient],
  );

  /** Where tapping the notification (or its in-app toast) actually takes
   * you - the screen that already shows whatever just changed, picked
   * fresh by `invalidateForNotification` above by the time this runs. */
  const handleRedirect = useCallback(
    (data: PushContent) => {
      switch (data.kind) {
        case 'trusted-contact-accepted':
          router.push('/settings/trusted-contacts');
          break;
        case 'recovery-request-created':
          router.push('/settings/trusted-contacts/as-contact');
          break;
        case 'recovery-request-contact-responded':
        case 'recovery-request-ready':
        case 'recovery-request-failed':
        case 'device-approved':
        case 'device-declined':
          router.push('/settings/recovery');
          break;
        case 'device-approval-requested':
          router.push('/settings/devices');
          break;
        default:
          data satisfies never;
      }
    },
    [router],
  );

  const handleResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      // iOS APNs : data in response.notification.request.trigger.payload.data
      // Android FCM : data in response.notification.request.content.data
      const data = (response.notification.request.content.data ||
        (response.notification.request.trigger as any).payload.data) as PushContent | undefined;
      if (data) {
        invalidateForNotification(data);
        handleRedirect(data);
      }
    },
    [invalidateForNotification, handleRedirect],
  );

  const handleToast = useCallback(
    (notification: Notifications.Notification) => {
      const data = (notification.request.content.data ||
        (notification.request.trigger as any).payload.data) as PushContent | undefined;
      if (data) invalidateForNotification(data);
      toast.info(
        notification.request.content.title || t('messages.new_notification', { count: 1 }),
        {
          description: notification.request.content.body ?? undefined,
          onPress: data ? () => handleRedirect(data) : undefined,
        },
      );
    },
    [toast, t, invalidateForNotification, handleRedirect],
  );

  useEffect(() => {
    if (!user) return;

    // Register token — async registration, state updates happen in the resolved callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleRegisterForPushNotificationsAsync().then(
      (token) => {
        setPushToken(token);
        updatePushToken({
          provider: Platform.OS === 'ios' ? 'apns' : 'fcm',
          token,
          deviceType: Platform.OS === 'ios' ? 'ios' : 'android',
        });
      },
      (err) => {
        console.error('Error getting push token:', err);
        setError(err);
      },
    );

    // Listener when app is open
    notificationsListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('🔔 Notification received:', notification);
        setNotifications((prev) => (prev ? [...prev, notification] : [notification]));
        handleToast(notification);
      },
    );

    // Listener when notification is clicked
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('🔔 Notification response received:', JSON.stringify(response, null, 2));
      handleResponse(response);
    });

    // Handle notification that opened the app
    (async () => {
      const initialResponse = Notifications.getLastNotificationResponse();
      if (initialResponse) {
        console.log('🔔 Initial notification response:', JSON.stringify(initialResponse, null, 2));
        handleResponse(initialResponse);
        await Notifications.clearLastNotificationResponseAsync();
      }
    })();

    return () => {
      notificationsListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [
    user,
    handleRegisterForPushNotificationsAsync,
    setPushToken,
    updatePushToken,
    handleToast,
    handleResponse,
  ]);

  return (
    <NotificationsContext.Provider
      value={{
        permissionStatus,
        pushToken,
        notifications,
        error,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};
