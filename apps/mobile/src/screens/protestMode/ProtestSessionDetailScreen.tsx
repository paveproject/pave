import { Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useSessionTrace } from '../../hooks/protestMode/useSessionTrace';
import type { ProtestDataSource } from '../../lib/protestMode/readSession';
import { AudioSegments } from './components/AudioSegments';
import { ProtestTraceMap } from './components/ProtestTraceMap';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';

interface ProtestSessionDetailScreenProps {
  /** Overrides the route param, for a caller whose segment isn't named `id`. */
  sessionId?: string;
  /** Whose recording, when not the signed-in user's. */
  source?: ProtestDataSource;
}

/** Enough to read a route's shape without pushing the numbers off-screen. */
const MAP_HEIGHT_RATIO = 0.4;

const ProtestSessionDetailScreen = ({
  sessionId,
  source,
}: ProtestSessionDetailScreenProps = {}) => {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = sessionId ?? params.id;
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const { colors, theme } = useTheme();
  const { height } = useWindowDimensions();
  const { points, audio, startedAt, endedAt, syncedCount, isReadingRemote } = useSessionTrace(
    id,
    source,
  );

  const summary =
    points.length === 0 && isReadingRemote
      ? t('pages.protest_mode.sessions.reading')
      : `${t('pages.protest_mode.sessions.positions', { count: points.length })} · ${
          points.length === syncedCount
            ? t('pages.protest_mode.sessions.all_sent')
            : t('pages.protest_mode.sessions.pending', { count: points.length - syncedCount })
        }`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: theme.spaces.horizontal,
          paddingBottom: theme.spaces.xl,
          gap: theme.spaces.xl,
        }}
      >
        <View style={{ gap: theme.spaces.sm }}>
          <Text variant="title">
            {startedAt
              ? format.dateTime(startedAt, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </Text>
          <Text textColor="muted">
            {endedAt
              ? t('pages.protest_mode.sessions.ended_at', {
                  time: format.dateTime(endedAt, { hour: '2-digit', minute: '2-digit' }),
                })
              : t('pages.protest_mode.sessions.open')}
          </Text>
          {/* While the blobs are still being fetched and decrypted there is
              nothing to count yet - saying "0 positions" would be a lie. */}
          <Text textColor="muted">{summary}</Text>
        </View>

        {points.length > 0 ? (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/protest-session/[id]/trace', params: { id: id! } })
            }
            accessibilityRole="button"
            accessibilityLabel={t('pages.protest_mode.sessions.open_map')}
            // The radius lives here with `overflow: hidden`: a native map view
            // does not clip itself to its own `borderRadius` on Android.
            style={{
              height: height * MAP_HEIGHT_RATIO,
              borderRadius: theme.border.radius.lg,
              overflow: 'hidden',
              backgroundColor: colors.muted,
            }}
          >
            <ProtestTraceMap points={points} interactive={false} />
          </Pressable>
        ) : null}

        {/* Only ever from the server: the local database holds positions as
            plaintext rows, but audio never exists locally except as the
            ciphertext waiting to upload. */}
        {audio.length > 0 ? <AudioSegments chunks={audio} /> : null}
      </ScrollView>
    </View>
  );
};

export default ProtestSessionDetailScreen;
