import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { LegendList } from '@legendapp/list/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFormatter } from 'use-intl';
import type { OfflineTransaction } from '@tanstack/offline-transactions/react-native';
import { reportsExecutor } from '../../../../../../providers/sync/offlineExecutor/reportsExecutor';
import { protestExecutor } from '../../../../../../providers/sync/offlineExecutor/protestExecutor';
import { useTheme } from '../../../../../../providers/ThemeProvider';
import { View } from '../../../../../../components/ui/view';
import { Text } from '../../../../../../components/ui/text';

/** Same polling cadence as `index.tsx`'s own count - this is the one
 * place that can see a transaction silently retrying inside the library,
 * before it ever succeeds or gives up permanently. */
const OUTBOX_POLL_MS = 2000;

interface OutboxEntry {
  executor: string;
  transaction: OfflineTransaction;
}

/** Every executor the app runs. Add a line here when a new one appears - this
 * screen and `index.tsx`'s badge are the only two places that enumerate
 * them. */
const EXECUTORS = [
  { name: 'reports', executor: reportsExecutor },
  { name: 'protest', executor: protestExecutor },
] as const;

type Theme = ReturnType<typeof useTheme>;

const OutboxEntryRow = ({
  entry,
  theme,
  colors,
}: {
  entry: OutboxEntry;
  theme: Theme['theme'];
  colors: Theme['colors'];
}) => {
  const format = useFormatter();
  const insets = useSafeAreaInsets();
  const { transaction } = entry;

  return (
    <View
      style={{
        paddingLeft: insets.left + theme.spaces.horizontal,
        paddingRight: insets.right + theme.spaces.horizontal,
        paddingVertical: theme.spaces.xs,
        borderBottomWidth: 1,
        borderBottomColor: colors.muted,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '600' }}>
          {entry.executor} · {transaction.mutationFnName}
        </Text>
        <Text variant="caption" textColor="muted">
          {transaction.retryCount} retries · next{' '}
          {format.dateTime(new Date(transaction.nextAttemptAt), { timeStyle: 'medium' })}
        </Text>
      </View>
      {transaction.lastError ? (
        <Text variant="caption" textColor="destructive" numberOfLines={2}>
          last attempt: {transaction.lastError.message}
        </Text>
      ) : (
        <Text variant="caption" textColor="muted">
          no attempt has failed yet
        </Text>
      )}
    </View>
  );
};

/**
 * `__DEV__`-only, reachable from `index.tsx`'s "Stuck in the outbox" row -
 * its own plain screen (no `FieldGroup`/`Host`) specifically so this
 * `LegendList` gets ordinary RN scrolling, not nested inside a native
 * `Form`/`Section` (see `index.tsx`'s own doc comment on why that doesn't
 * work).
 */
const SyncOutboxDebugScreen = () => {
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshOutbox = useCallback(async () => {
    const perExecutor = await Promise.all(
      EXECUTORS.map(async ({ name, executor }) =>
        (await executor.peekOutbox()).map((transaction) => ({ executor: name, transaction })),
      ),
    );
    setOutbox(perExecutor.flat());
  }, []);

  /** Escape hatch for a wedged queue: a transaction that keeps failing stays
   * in the outbox forever by design, with no other way out but a reinstall.
   * Destructive - what is dropped never reaches the server. */
  const handleClear = useCallback(
    (name: string, executor: (typeof EXECUTORS)[number]['executor']) => {
      Alert.alert(
        `Clear the ${name} outbox?`,
        'Anything still queued is dropped and never reaches the server. Debug only.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear',
            style: 'destructive',
            onPress: async () => {
              await executor.clearOutbox();
              await refreshOutbox();
            },
          },
        ],
      );
    },
    [refreshOutbox],
  );

  useEffect(() => {
    // Fetch-on-mount/poll; `refreshOutbox` sets state after awaiting, same
    // justification as `recovery-keys.tsx`'s `reload`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshOutbox();
    const interval = setInterval(refreshOutbox, OUTBOX_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshOutbox]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshOutbox();
    setIsRefreshing(false);
  }, [refreshOutbox]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LegendList
        data={outbox}
        keyExtractor={(entry) => `${entry.executor}:${entry.transaction.id}`}
        renderItem={({ item }) => <OutboxEntryRow entry={item} theme={theme} colors={colors} />}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.spaces.vertical }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        // In the header, not below the list: `LegendList` takes the remaining
        // height, so a sibling underneath renders at zero height.
        ListHeaderComponent={
          <View
            style={{
              paddingVertical: theme.spaces.horizontal,
              paddingLeft: insets.left + theme.spaces.horizontal,
              paddingRight: insets.right + theme.spaces.horizontal,
              gap: theme.spaces.sm,
            }}
          >
            {EXECUTORS.map(({ name, executor }) => {
              const queued = outbox.filter((entry) => entry.executor === name).length;
              return (
                <Pressable
                  key={name}
                  onPress={() => handleClear(name, executor)}
                  disabled={queued === 0}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: theme.spaces.md,
                    borderRadius: theme.border.radius.md,
                    backgroundColor: colors.muted,
                    opacity: queued === 0 ? 0.4 : 1,
                  }}
                >
                  <Text
                    style={{ color: queued === 0 ? colors.mutedForeground : colors.destructive }}
                  >
                    {`Clear the ${name} outbox`}
                  </Text>
                  <Text textColor="muted">{String(queued)}</Text>
                </Pressable>
              );
            })}
          </View>
        }
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: theme.spaces.xl,
              paddingLeft: insets.left + theme.spaces.xl,
              paddingRight: insets.right + theme.spaces.xl,
            }}
          >
            <Text textColor="muted">Nothing waiting - either idle, or already synced.</Text>
          </View>
        }
      />
    </View>
  );
};

export default SyncOutboxDebugScreen;
