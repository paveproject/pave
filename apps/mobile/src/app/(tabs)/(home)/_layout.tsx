import { useAuth } from '../../../providers/AuthProvider';
import { useTheme } from '../../../providers/ThemeProvider';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { useNow, useTranslations } from 'use-intl';

const AppLayout = ({ segment }: { segment: string }) => {
  const { defaultScreenOptions } = useTheme();
  const { user } = useAuth();
  const t = useTranslations();
  const now = useNow();

  const hour = now.getHours();
  const timeOfDay =
    hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const name = user?.name || user?.username;

  const initialRouteName = useMemo(() => {
    switch (segment) {
      default:
        return 'index';
    }
  }, [segment]);

  return (
    <Stack initialRouteName={initialRouteName} screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: name
            ? t('messages.greeting_with_name', { timeOfDay, name })
            : t('messages.greeting', { timeOfDay }),
          headerLargeTitleEnabled: true,
        }}
      />
    </Stack>
  );
};

export default AppLayout;
