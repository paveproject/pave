import { LegendList, LegendListProps } from '@legendapp/list/react-native';
import { Button } from '../ui/Button';
import { Text } from '../ui/text';
import { GAP } from '../../theme/globals';
import { useCallback, useMemo } from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { Icons } from '../../constants/Icons';
import { BrandIcon, BrandIconProps } from '../../lib/icons';
import { SocialProvider } from 'better-auth/types';

type Provider = {
  name: SocialProvider;
  label: string;
  icon: { component: BrandIcon; variant?: BrandIconProps['variant'] };
};

interface OAuthProvidersProps extends Omit<LegendListProps<Provider>, 'data' | 'children'> {
  data?: Provider[];
}

export const OAuthProviders = ({
  data,
  numColumns = 2,
  style,
  contentContainerStyle,
  ...props
}: OAuthProvidersProps) => {
  const { loginWithOAuth } = useAuth();
  const { colors, mode } = useTheme();

  const providers = useMemo(
    (): Provider[] =>
      data || [
        {
          name: 'google',
          label: 'Google',
          icon: { component: Icons.brands.google },
        },
        {
          name: 'apple',
          label: 'Apple',
          icon: { component: Icons.brands.apple, variant: mode },
        },
        {
          name: 'facebook',
          label: 'Facebook',
          icon: { component: Icons.brands.facebook },
        },
        {
          name: 'github',
          label: 'GitHub',
          icon: { component: Icons.brands.github, variant: mode },
        },
      ],
    [mode, data],
  );

  const renderItem = useCallback(
    ({ item }: { item: Provider }) => (
      <Button variant="muted" onPress={() => loginWithOAuth(item.name)}>
        <item.icon.component width={18} height={18} variant={item.icon.variant} />
        <Text style={{ color: colors.foreground }}>{item.label}</Text>
      </Button>
    ),
    [loginWithOAuth, colors.foreground],
  );

  return (
    <LegendList
      data={providers}
      renderItem={renderItem}
      keyExtractor={(item) => item.name}
      numColumns={numColumns}
      style={[{ overflow: 'visible' }, style]}
      contentContainerStyle={[{ gap: GAP }, contentContainerStyle]}
      {...props}
    />
  );
};
