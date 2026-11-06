import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { LegendList } from '@legendapp/list/react-native';
import { useRouter } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useObservable } from '../../hooks/useObservable';
import { observeSessionCounts, observeSessions } from '../../lib/watermelon/protestSessions';
import type { ProtestSession } from '../../lib/watermelon/models/ProtestSession';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { Badge } from '../../components/ui/badge';
import Empty from '../../components/ui/empty';
import { Icons } from '../../constants/icons';

/**
 * Read straight from WatermelonDB, not from `GET /me/protest-sessions`: a
 * recording has to be visible the moment it exists, including offline or
 * while a push is failing. The server copy is for reading a session back on
 * another device.
 */
const SessionRow = ({ session }: { session: ProtestSession }) => {
  const router = useRouter();
  const t = useTranslations();
  const format = useFormatter();
  const { theme } = useTheme();

  const getTotal = useCallback(() => observeSessionCounts(session.id).total, [session.id]);
  const getSynced = useCallback(() => observeSessionCounts(session.id).synced, [session.id]);
  const total = useObservable<number>(getTotal, 0);
  const synced = useObservable<number>(getSynced, 0);

  const pending = total - synced;
  const isOpen = session.endedAt === null;

  return (
    <Pressable
      onPress={() => router.push(`/(tabs)/protest-mode/${session.id}`)}
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
          {format.dateTime(session.startedAt, {
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

const ProtestSessionsScreen = () => {
  const t = useTranslations();
  const { colors, theme } = useTheme();

  const getSessions = useCallback(() => observeSessions(), []);
  const sessions = useObservable<ProtestSession[]>(getSessions, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LegendList
        data={sessions}
        keyExtractor={(session) => session.id}
        renderItem={({ item }) => <SessionRow session={item} />}
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
            <Empty icon={Icons.megaphone} title={t('pages.protest_mode.sessions.empty')} />
          </View>
        }
      />
    </View>
  );
};

export default ProtestSessionsScreen;
