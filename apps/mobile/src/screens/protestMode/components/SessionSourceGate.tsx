import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { useSessionSource } from '../../../hooks/protestMode/useSessionSource';
import { View } from '../../../components/ui/view';
import Empty from '../../../components/ui/empty';
import { Icons } from '../../../constants/icons';
import type { ProtestDataSource } from '../../../lib/protestMode/readSession';

/** The loading, not-found and no-key states every `protest-session/[id]/*`
 * route needs before it can decrypt anything. */
export const SessionSourceGate = ({
  children,
}: {
  children: (resolved: { sessionId: string; source?: ProtestDataSource }) => ReactNode;
}) => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { source, isLoading, noKey, notFound } = useSessionSource(id);

  if (isLoading || notFound || noKey) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          paddingTop: theme.spaces.vertical,
          paddingLeft: insets.left + theme.spaces.horizontal,
          paddingRight: insets.right + theme.spaces.horizontal,
          paddingBottom: insets.bottom + theme.spaces.vertical,
        }}
      >
        {isLoading ? (
          <ActivityIndicator />
        ) : (
          <Empty
            icon={notFound ? Icons.megaphone : Icons.lock}
            title={t(
              notFound
                ? 'pages.protest_mode.sessions.not_found'
                : 'pages.protest_mode.sessions.no_key',
            )}
          />
        )}
      </View>
    );
  }

  return <>{children({ sessionId: id, source: source ?? undefined })}</>;
};
