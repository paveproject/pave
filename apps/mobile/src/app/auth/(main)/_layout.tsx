import { useTheme } from '../../../providers/ThemeProvider';
import { Stack } from 'expo-router';
import { upperFirst } from 'lodash';
import { useTranslations } from 'use-intl';

const AuthLayout = () => {
  const t = useTranslations();
  const { defaultScreenOptions } = useTheme();
  return (
    <Stack
      initialRouteName="index"
      screenOptions={{
        ...defaultScreenOptions,
        headerTransparent: true,
        headerStyle: {
          backgroundColor: 'transparent',
        },
      }}
    >
      <Stack.Screen name="index" options={{ title: upperFirst(t('common.messages.welcome')) }} />
      <Stack.Screen
        name="login/index"
        options={{ headerTitle: upperFirst(t('common.messages.login')) }}
      />
      <Stack.Screen
        name="login/otp"
        options={{ headerTitle: upperFirst(t('common.messages.otp')) }}
      />
      <Stack.Screen
        name="signup"
        options={{ headerTitle: upperFirst(t('common.messages.signup')) }}
      />
    </Stack>
  );
};

export default AuthLayout;
