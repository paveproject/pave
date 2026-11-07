import { useCallback, useMemo } from 'react';
import { Pressable } from 'react-native';
import { LegendList } from '@legendapp/list/react-native';
import { useRouter } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useObservable, type Subscribable } from '../../hooks/useObservable';
import { observeSessionCounts, observeSessions } from '../../lib/watermelon/protestSessions';
import type { ProtestSession } from '../../lib/watermelon/models/ProtestSession';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { Badge } from '../../components/ui/badge';
import Empty from '../../components/ui/empty';
import { Icons } from '../../constants/icons';
import { useRemoteProtestSessions } from '../../hooks/protestMode/useRemoteProtestSessions';
import type { ProtestDataSource } from '../../lib/protestMode/readSession';

/**
 * One line, whichever side the recording came from.
 *
 * The local database is the primary source - a recording has to be visible
 * the moment it exists, offline or while a push is failing. The server is
 * what covers the case the feature exists for: a device that no longer holds
 * the local rows (reinstalled, replaced, or simply not the one that recorded)
 * still gets its trajectories back, decrypted here.
 */
interface SessionLine {
  id: string;
  startedAt: Date;
  isOpen: boolean;
  total: number;
  /** Positions still only on this device. Always 0 for a server-read line -
   * everything it holds is, by definition, already uploaded. */
  pending: number;
}

/** Local rows watch their own counts, so a flush updates the line live. */
const LocalSessionRow = ({
  session,
  onPress,
}: {
  session: ProtestSession;
  onPress: (sessionId: string) => void;
}) => {
  const getTotal = useCallback(() => observeSessionCounts(session.id).total, [session.id]);
  const getSynced = useCallback(() => observeSessionCounts(session.id).synced, [session.id]);
  const total = useObservable<number>(getTotal, 0);
  const synced = useObservable<number>(getSynced, 0);

  return (
    <SessionRow
      onPress={onPress}
      line={{
        id: session.id,
        startedAt: session.startedAt,
        isOpen: session.endedAt === null,
        total,
        pending: total - synced,
      }}
    />
  );
};

const SessionRow = ({
  line,
  onPress,
}: {
  line: SessionLine;
  onPress: (sessionId: string) => void;
}) => {
  const t = useTranslations();
  const format = useFormatter();
  const { theme } = useTheme();

  const { total, pending, isOpen } = line;

  return (
    <Pressable
      onPress={() => onPress(line.id)}
      style={{
        flexDirection: 'row',
        // Centres the badge against the whole two-line block.
        alignItems: 'center',
        gap: theme.spaces.md,
        paddingHorizontal: theme.spaces.horizontal,
        paddingVertical: theme.spaces.md,
      }}
    >
      <View style={{ flex: 1, gap: theme.spaces.xs }}>
        <Text>
          {format.dateTime(line.startedAt, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
        <Text textColor="muted">
          {t('pages.protest_mode.sessions.positions', { count: total })}
          {pending > 0
            ? ` · ${t('pages.protest_mode.sessions.pending', { count: pending })}`
            : total > 0
              ? ` · ${t('pages.protest_mode.sessions.all_sent')}`
              : ''}
        </Text>
      </View>
      {isOpen ? (
        <Badge variant="destructive" label={t('pages.protest_mode.sessions.open')} />
      ) : null}
    </Pressable>
  );
};

interface ProtestSessionsScreenProps {
  /** Whose recordings, when not the signed-in user's. */
  source?: ProtestDataSource;
}

/** Stands in for the local database on the foreign-source path: it only ever
 * holds this device's own rows. */
const NEVER_OBSERVABLE: Subscribable<ProtestSession[]> = {
  subscribe: () => ({ unsubscribe: () => undefined }),
};

const ProtestSessionsScreen = ({ source }: ProtestSessionsScreenProps) => {
  const t = useTranslations();
  const router = useRouter();
  const { colors, theme } = useTheme();

  const getSessions = useCallback(() => (source ? NEVER_OBSERVABLE : observeSessions()), [source]);
  const local = useObservable<ProtestSession[]>(getSessions, []);
  const { sessions: remote, isLoading: isReadingRemote } = useRemoteProtestSessions(source);

  // One route for every session, whoever owns it - see `useSessionSource`.
  const handlePress = useCallback(
    (sessionId: string) => {
      router.push({ pathname: '/protest-session/[id]', params: { id: sessionId } });
    },
    [router],
  );

  // Local first, then whatever the server holds that this device doesn't.
  // Merged on id so a session that exists on both sides is shown once, from
  // the local row, which is the one that knows what is still unsent.
  const lines = useMemo(() => {
    const localIds = new Set(local.map((session) => session.id));
    const extra: SessionLine[] = remote
      .filter((session) => !localIds.has(session.id))
      .map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        isOpen: session.endedAt === null,
        total: session.positions.length,
        pending: 0,
      }));
    return { local, extra };
  }, [local, remote]);

  type Item = { kind: 'local'; session: ProtestSession } | { kind: 'remote'; line: SessionLine };
  const items: Item[] = [
    ...lines.local.map((session) => ({ kind: 'local' as const, session })),
    ...lines.extra.map((line) => ({ kind: 'remote' as const, line })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LegendList
        data={items}
        keyExtractor={(item) => (item.kind === 'local' ? item.session.id : item.line.id)}
        renderItem={({ item }) =>
          item.kind === 'local' ? (
            <LocalSessionRow session={item.session} onPress={handlePress} />
          ) : (
            <SessionRow line={item.line} onPress={handlePress} />
          )
        }
        contentInsetAdjustmentBehavior="automatic"
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: theme.spaces.xl,
            }}
          >
            <Empty
              icon={Icons.megaphone}
              title={t(
                // A device that has just been set up has nothing local, and
                // the server's copies are still being fetched and decrypted -
                // "no recordings" would be wrong, not just early.
                isReadingRemote
                  ? 'pages.protest_mode.sessions.reading'
                  : 'pages.protest_mode.sessions.empty',
              )}
            />
          </View>
        }
      />
    </View>
  );
};

export default ProtestSessionsScreen;
