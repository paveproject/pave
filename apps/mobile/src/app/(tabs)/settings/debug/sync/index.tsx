import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Host, Icon, Column, FieldGroup, Row, Spacer, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  refreshable,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useFormatter } from 'use-intl';
import { useSyncRegistry, useSyncLogStore, type SyncLogEntry } from '../../../../../providers/sync';
import { reportsExecutor } from '../../../../../providers/sync/offlineExecutor/reportsExecutor';
import { useTheme } from '../../../../../providers/ThemeProvider';
import { View } from '../../../../../components/ui/view';
import { Icons } from '../../../../../constants/icons';

/** Debug-only polling - this is the one place that can see a transaction
 * that's silently retrying inside the library, before it ever succeeds or
 * gives up permanently (nothing else is notified either way). Just the
 * count here (for the nav row's badge) - `outbox.tsx` does the same poll
 * for the actual list. */
const OUTBOX_POLL_MS = 2000;

type Theme = ReturnType<typeof useTheme>;

const TaskStatusRow = ({
  id,
  status,
  pendingCount,
  lastSyncedAt,
  lastError,
  colors,
}: {
  id: string;
  status: SyncLogEntry['status'];
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  colors: Theme['colors'];
}) => {
  const format = useFormatter();

  return (
    <Row
      spacing={8}
      alignment="center"
      modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
    >
      <NativeText textStyle={{ color: colors.foreground, fontWeight: '600' }}>{id}</NativeText>
      <Spacer flexible />
      <Column alignment="end">
        <NativeText
          textStyle={{
            color: status === 'error' ? colors.destructive : colors.foreground,
            textAlign: 'right',
          }}
        >
          {`${status}${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}`}
        </NativeText>
        <NativeText
          textStyle={{
            color: lastError ? colors.destructive : colors.mutedForeground,
            textAlign: 'right',
          }}
          numberOfLines={1}
        >
          {lastError ??
            (lastSyncedAt
              ? format.dateTime(new Date(lastSyncedAt), { timeStyle: 'medium' })
              : 'never')}
        </NativeText>
      </Column>
    </Row>
  );
};

/**
 * `__DEV__`-only inspector for `providers/sync` (see `settings/debug/index.tsx`)
 * - shows every registered task's live status at a glance. The two
 * potentially-long lists this used to render inline (outbox, log) now
 * live on their own dedicated screens (`sync/outbox.tsx`/`sync/log.tsx`,
 * registered directly in `settings/_layout.tsx` by their nested path -
 * no `_layout.tsx` in this folder) instead - confirmed on-device that
 * a `LegendList` doesn't behave correctly nested inside a
 * `FieldGroup.Section` (the enclosing native `Form`/`Section` row sizes
 * to the single already-rendered item's intrinsic content, ignoring an
 * explicit RN `height` style, and the scroll gesture is captured by the
 * outer native list) nor does giving the enclosing `Host` a
 * `matchContents` size work (`Form`/`List` has no well-defined intrinsic
 * height for `.fixedSize()` to report). A plain navigation row to a
 * separate, fully plain-RN screen sidesteps both.
 */
const SyncDebugScreen = () => {
  const router = useRouter();
  const { colors, theme, mode } = useTheme();
  const tasks = useSyncRegistry();
  const entries = useSyncLogStore((state) => state.entries);
  const taskIds = Object.keys(tasks).sort();
  const [outboxCount, setOutboxCount] = useState(0);

  const refreshOutboxCount = useCallback(async () => {
    const outbox = await reportsExecutor.peekOutbox();
    setOutboxCount(outbox.length);
  }, []);

  useEffect(() => {
    // Fetch-on-mount/poll; `refreshOutboxCount` sets state after awaiting,
    // same justification as `recovery-keys.tsx`'s `reload`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshOutboxCount();
    const interval = setInterval(refreshOutboxCount, OUTBOX_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshOutboxCount]);

  const handleOutbox = useCallback(() => {
    router.push('/settings/debug/sync/outbox');
  }, [router]);

  const handleLog = useCallback(() => {
    router.push('/settings/debug/sync/log');
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Host style={{ flex: 1, width: '100%' }} seedColor={colors.foreground} colorScheme={mode}>
        <FieldGroup
          style={{ backgroundColor: colors.background }}
          modifiers={
            Platform.OS === 'ios'
              ? [
                  scrollContentBackground('hidden'),
                  background(colors.background),
                  tint(colors.foreground),
                  refreshable(refreshOutboxCount),
                ]
              : undefined
          }
        >
          <FieldGroup.Section title="Sync tasks">
            {taskIds.length === 0 ? (
              <Row
                alignment="center"
                modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
              >
                <NativeText textStyle={{ color: colors.mutedForeground }}>
                  No sync task registered yet.
                </NativeText>
              </Row>
            ) : (
              taskIds.map((id) => (
                <TaskStatusRow
                  key={id}
                  id={id}
                  status={tasks[id].status}
                  pendingCount={tasks[id].pendingCount}
                  lastSyncedAt={tasks[id].lastSyncedAt}
                  lastError={tasks[id].lastError}
                  colors={colors}
                />
              ))
            )}
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Row
              spacing={theme.spaces.md}
              alignment="center"
              onPress={handleOutbox}
              modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
            >
              <Icon name={Icons.warning} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {`Stuck in the outbox (${outboxCount})`}
              </NativeText>
              <Spacer flexible />
              <Icon
                name={Icons.chevronRight}
                size={theme.icons.sizes.sm}
                color={colors.mutedForeground}
              />
            </Row>
            <Row
              spacing={theme.spaces.md}
              alignment="center"
              onPress={handleLog}
              modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
            >
              <Icon name={Icons.clock} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {`Recent activity (${entries.length})`}
              </NativeText>
              <Spacer flexible />
              <Icon
                name={Icons.chevronRight}
                size={theme.icons.sizes.sm}
                color={colors.mutedForeground}
              />
            </Row>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
};

export default SyncDebugScreen;
