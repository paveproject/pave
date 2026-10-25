import { useCallback, useEffect, useState } from 'react';
import { LegendList } from '@legendapp/list/react-native';
import { useFormatter } from 'use-intl';
import type { OfflineTransaction } from '@tanstack/offline-transactions/react-native';
import { reportsExecutor } from '../../../../../providers/sync/offlineExecutor/reportsExecutor';
import { useTheme } from '../../../../../providers/ThemeProvider';
import { View } from '../../../../../components/ui/view';
import { Text } from '../../../../../components/ui/text';

/** Same polling cadence as `index.tsx`'s own count - this is the one
 * place that can see a transaction silently retrying inside the library,
 * before it ever succeeds or gives up permanently. */
const OUTBOX_POLL_MS = 2000;

interface OutboxEntry {
  executor: string;
  transaction: OfflineTransaction;
}

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
  const { transaction } = entry;

  return (
    <View
      style={{
        paddingHorizontal: theme.spaces.horizontal,
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
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshOutbox = useCallback(async () => {
    const reportsOutbox = await reportsExecutor.peekOutbox();
    setOutbox(reportsOutbox.map((transaction) => ({ executor: 'reports', transaction })));
  }, []);

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
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: theme.spaces.xl,
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
