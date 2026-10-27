import { useTheme } from '../../../providers/ThemeProvider';
import { Stack } from 'expo-router';
import { useMemo } from 'react';

const AppLayout = ({ segment }: { segment: string }) => {
  const { defaultScreenOptions } = useTheme();

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
          // Hidden for now - `HomeMap` reserves its own top space from
          // `insets.top` directly instead of a header bar. Revisit once
          // this screen has a real header to show.
          headerShown: false,
        }}
      />
    </Stack>
  );
};

export default AppLayout;
