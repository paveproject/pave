import { useTheme } from '../../../providers/ThemeProvider';
import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

const AuthPasswordLayout = () => {
  const { defaultScreenOptions } = useTheme();
  const t = useTranslations();
  return (
    <>
      <Stack
        initialRouteName="forgot-password"
        screenOptions={{
          ...defaultScreenOptions,
          headerTransparent: true,
          headerStyle: {
            backgroundColor: 'transparent',
          },
        }}
      >
        <Stack.Screen
          name="forgot-password"
          options={{ title: t('common.messages.forgot_password') }}
        />
        <Stack.Screen
          name="reset-password"
          options={{ title: t('common.messages.reset_your_password') }}
        />
      </Stack>
    </>
  );
};

export default AuthPasswordLayout;
