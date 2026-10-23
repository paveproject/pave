import { LegendList } from '@legendapp/list/react-native';
import { useFormatter } from 'use-intl';
import { useSyncLogStore, type SyncLogEntry } from '../../../../../providers/sync';
import { useTheme } from '../../../../../providers/ThemeProvider';
import { View } from '../../../../../components/ui/view';
import { Text } from '../../../../../components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Theme = ReturnType<typeof useTheme>;

const LogEntryRow = ({
  entry,
  theme,
  colors,
}: {
  entry: SyncLogEntry;
  theme: Theme['theme'];
  colors: Theme['colors'];
}) => {
  const format = useFormatter();

  return (
    <View
      style={{
        paddingHorizontal: theme.spaces.horizontal,
        paddingVertical: theme.spaces.xs,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '600' }}>{entry.taskId}</Text>
        <Text variant="caption" textColor="muted">
          {format.dateTime(new Date(entry.timestamp), { timeStyle: 'medium' })}
        </Text>
      </View>
      <Text
        variant="caption"
        textColor={entry.status === 'error' ? 'destructive' : 'muted'}
        numberOfLines={2}
      >
        {entry.status}
        {entry.message ? `: ${entry.message}` : ''}
      </Text>
    </View>
  );
};

/**
 * `__DEV__`-only, reachable from `index.tsx`'s "Recent activity" row -
 * its own plain screen (no `FieldGroup`/`Host`), same reasoning as
 * `outbox.tsx`: a scrolling `LegendList` needs ordinary RN scrolling, not
 * nested inside a native `Form`/`Section`.
 */
const SyncLogDebugScreen = () => {
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const entries = useSyncLogStore((state) => state.entries);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {entries.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text textColor="muted">Nothing logged yet.</Text>
        </View>
      ) : (
        <LegendList
          data={entries}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => <LogEntryRow entry={item} theme={theme} colors={colors} />}
          contentContainerStyle={{
            paddingBottom: insets.bottom + theme.spaces.vertical,
          }}
        />
      )}
    </View>
  );
};

export default SyncLogDebugScreen;
