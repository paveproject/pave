import { ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useSessionTrace } from '../../hooks/protestMode/useSessionTrace';
import { AudioSegmentList } from './components/AudioSegmentList';
import { View } from '../../components/ui/view';
import Empty from '../../components/ui/empty';
import { Icons } from '../../constants/icons';
import type { ProtestDataSource } from '../../lib/protestMode/readSession';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProtestAudioListScreenProps {
  sessionId?: string;
  source?: ProtestDataSource;
}

/** Always read back from the server: unlike positions, audio never exists
 * locally except as ciphertext awaiting upload. */
const ProtestAudioListScreen = ({ sessionId, source }: ProtestAudioListScreenProps = {}) => {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = sessionId ?? params.id;
  const t = useTranslations();
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { audio, isReadingRemote, refresh, isRefreshing } = useSessionTrace(id, source);

  // A `ScrollView`, not a plain `View`: empty and loading are exactly the
  // states where the answer may be stale, so they have to be the ones that can
  // be pulled to retry.
  if (audio.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: theme.spaces.vertical,
          paddingLeft: insets.left + theme.spaces.horizontal,
          paddingRight: insets.right + theme.spaces.horizontal,
          paddingBottom: insets.bottom + theme.spaces.vertical,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />
        }
      >
        {isReadingRemote ? (
          <ActivityIndicator />
        ) : (
          <Empty icon={Icons.waveform} title={t('pages.protest_mode.sessions.no_audio')} />
        )}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AudioSegmentList chunks={audio} onRefresh={refresh} isRefreshing={isRefreshing} />
    </View>
  );
};

export default ProtestAudioListScreen;
