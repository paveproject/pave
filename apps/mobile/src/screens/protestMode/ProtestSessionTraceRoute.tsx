import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useSessionSource } from '../../hooks/protestMode/useSessionSource';
import ProtestTraceScreen from './ProtestTraceScreen';
import { View } from '../../components/ui/view';
import Empty from '../../components/ui/empty';
import { Icons } from '../../constants/icons';

/** The full-screen trace, resolving its own source - same reasoning as
 * `ProtestSessionScreen`. */
const ProtestSessionTraceRoute = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const { colors } = useTheme();
  const { source, isLoading, noKey, notFound } = useSessionSource(id);

  if (isLoading || notFound || noKey) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
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

  return <ProtestTraceScreen sessionId={id} source={source ?? undefined} />;
};

export default ProtestSessionTraceRoute;
