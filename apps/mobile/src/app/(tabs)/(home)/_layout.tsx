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

  return <Stack initialRouteName={initialRouteName} screenOptions={defaultScreenOptions}></Stack>;
};

export default AppLayout;
