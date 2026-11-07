import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useSessionSource } from '../../hooks/protestMode/useSessionSource';
import ProtestSessionDetailScreen from './ProtestSessionDetailScreen';
import { View } from '../../components/ui/view';
import Empty from '../../components/ui/empty';
import { Icons } from '../../constants/icons';

/**
 * One recording, whoever owns it.
 *
 * The route that replaced a pair of them: `useSessionSource` works out from
 * the id alone whether this is the caller's own session or one they hold a
 * grant on, so the two cases are the same screen rather than two route trees
 * that had to be kept in step.
 */
const ProtestSessionScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const { colors } = useTheme();
  const { source, isLoading, noKey, notFound } = useSessionSource(id);

  const centred = {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.background,
  };

  if (isLoading) {
    return (
      <View style={centred}>
        <ActivityIndicator />
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={centred}>
        <Empty icon={Icons.megaphone} title={t('pages.protest_mode.sessions.not_found')} />
      </View>
    );
  }

  if (noKey) {
    return (
      <View style={centred}>
        <Empty icon={Icons.lock} title={t('pages.protest_mode.sessions.no_key')} />
      </View>
    );
  }

  return <ProtestSessionDetailScreen sessionId={id} source={source ?? undefined} />;
};

export default ProtestSessionScreen;
