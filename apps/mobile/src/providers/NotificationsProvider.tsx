import { createContext, use, useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthProvider';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useToast } from '../components/Toast';
import { usePushTokenUpdateMutation } from '@libs/query-client';
import { useTranslations } from 'use-intl';
import { PushNotificationPayload } from '@libs/api-js';

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
        const pushTokenString = (await Notifications.getDevicePushTokenAsync()).data;
        return pushTokenString;
      } catch (e) {
        throw new Error(`${e}`);
      }
    } else {
      throw new Error('Must use physical device for push notifications');
    }
  }, []);

  const handleRedirect = useCallback(
    (data: PushNotificationPayload) => {
      switch (data.type) {
        case 'reco:received':
          if (data.mediaType === 'movie') {
            router.push({
              pathname: '/film/[film_id]',
              params: { film_id: data.mediaId },
            });
          }
          if (data.mediaType === 'tv_series') {
            router.push({
              pathname: '/tv-series/[tv_series_id]',
              params: { tv_series_id: data.mediaId },
            });
          }
          break;
        case 'follow:new':
          router.push({
            pathname: '/user/[username]',
            params: { username: data.actorUsername },
          });
          break;
        case 'follow:request':
          router.push({
            pathname: '/follow-requests',
          });
          break;
        case 'follow:accepted':
          router.push({
            pathname: '/user/[username]',
            params: { username: data.actorUsername },
          });
          break;
        default:
          break;
      }
    },
    [router],
  );

  const handleResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      // iOS APNs : data in response.notification.request.trigger.payload.data
      // Android FCM : data in response.notification.request.content.data
      const data = (response.notification.request.content.data ||
        (response.notification.request.trigger as any).payload.data) as
        | PushNotificationPayload
        | undefined;
      if (data) {
        handleRedirect(data);
      }
    },
    [handleRedirect],
  );

  const handleToast = useCallback(
    (notification: Notifications.Notification) => {
      const data = (notification.request.content.data ||
        (notification.request.trigger as any).payload.data) as PushNotificationPayload | undefined;
      toast.info(
        notification.request.content.title || t('common.messages.new_notification', { count: 1 }),
        {
          description: notification.request.content.body ?? undefined,
          onPress: data && data.type ? () => handleRedirect(data) : undefined,
        },
      );
    },
    [toast, t, handleRedirect],
  );

  useEffect(() => {
    if (!user) return;

    // Register token — async registration, state updates happen in the resolved callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleRegisterForPushNotificationsAsync().then(
      (token) => {
        setPushToken(token);
        updatePushToken({
          body: {
            provider: Platform.OS === 'ios' || Platform.OS === 'macos' ? 'apns' : 'fcm',
            token,
            deviceType: Platform.OS === 'ios' ? 'ios' : 'android',
          },
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
