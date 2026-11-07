import { useCallback, useRef } from 'react';
import { ActivityIndicator, View as RNView } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useSessionTrace } from '../../hooks/protestMode/useSessionTrace';
import { ProtestTraceMap, type ProtestTraceMapRef } from './components/ProtestTraceMap';
import { Button } from '../../components/ui/Button';
import { View } from '../../components/ui/view';
import Empty from '../../components/ui/empty';
import { Icons } from '../../constants/icons';
import { Icons as LucideIcons } from '../../constants/IconsOld';
import type { ProtestDataSource } from '../../lib/protestMode/readSession';

interface ProtestTraceScreenProps {
  /** Overrides the route param, for a caller whose segment isn't named `id`. */
  sessionId?: string;
  /** Whose recording, when not the signed-in user's. */
  source?: ProtestDataSource;
}

/**
 * The trace, full screen and interactive - the only place it pans and zooms.
 *
 * Its own route rather than a modal over the session's figure: both are
 * native GL surfaces, and mounting two at once crashes the app.
 *
 * The recentre action lives in the header, not over the map, so it never sits
 * on top of the trace it is meant to reveal. Both header forms are declared,
 * as in `settings/trusted-contacts/_layout.tsx`:
 * `unstable_headerRightItems` renders native bar items where supported,
 * `headerRight` is the RN fallback.
 */
const ProtestTraceScreen = ({ sessionId, source }: ProtestTraceScreenProps = {}) => {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = sessionId ?? params.id;
  const t = useTranslations();
  const { colors, theme } = useTheme();
  const { points, isReadingRemote } = useSessionTrace(id, source);
  const map = useRef<ProtestTraceMapRef>(null);

  const recenter = useCallback(() => map.current?.recenter(), []);

  if (points.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        {isReadingRemote ? (
          <ActivityIndicator />
        ) : (
          <Empty icon={Icons.locateUnavailable} title={t('pages.protest_mode.sessions.no_trace')} />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spaces.sm }}>
              <Button
                variant="ghost"
                size="icon"
                icon={LucideIcons.Fit}
                onPress={recenter}
                accessibilityLabel={t('pages.protest_mode.sessions.recenter')}
              />
            </RNView>
          ),
          unstable_headerRightItems: () => [
            {
              type: 'button' as const,
              label: t('pages.protest_mode.sessions.recenter'),
              onPress: recenter,
              icon: { name: 'viewfinder', type: 'sfSymbol' as const },
            },
          ],
        }}
      />
      <ProtestTraceMap ref={map} points={points} interactive />
    </View>
  );
};

export default ProtestTraceScreen;
