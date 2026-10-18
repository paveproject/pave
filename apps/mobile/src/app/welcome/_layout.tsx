import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { meOptions, useMeUpdateMutation } from '@libs/query-client';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslations } from 'use-intl';

interface WelcomeContextValue {
  finish: () => Promise<void>;
}

const WelcomeContext = createContext<WelcomeContextValue | undefined>(undefined);

export const useWelcomeFinish = () => {
  const context = useContext(WelcomeContext);
  if (!context) throw new Error('useWelcomeFinish must be used within the /welcome stack');
  return context.finish;
};

const WelcomeLayout = () => {
  const t = useTranslations();
  const { defaultScreenOptions } = useTheme();
  const queryClient = useQueryClient();
  const { mutateAsync: updateMe } = useMeUpdateMutation();
  const finishPromiseRef = useRef<Promise<void> | null>(null);

  const finish = useCallback(() => {
    if (!finishPromiseRef.current) {
      const previous = queryClient.getQueryData(meOptions().queryKey);
      if (previous && previous.welcomedAt == null) {
        queryClient.setQueryData(meOptions().queryKey, (old) =>
          old ? { ...old, welcomedAt: new Date().toISOString() } : old,
        );
      }

      finishPromiseRef.current = updateMe({ welcomed: true })
        .then(() => undefined)
        .catch(() => {
          if (previous) queryClient.setQueryData(meOptions().queryKey, previous);
        });
    }
    return finishPromiseRef.current;
  }, [updateMe, queryClient]);

  useEffect(() => () => void finish(), [finish]);

  return (
    <WelcomeContext.Provider value={{ finish }}>
      <Stack screenOptions={defaultScreenOptions}>
        <Stack.Screen
          name="index"
          options={{
            title: t('messages.welcome'),
          }}
        />
      </Stack>
    </WelcomeContext.Provider>
  );
};

export default WelcomeLayout;
