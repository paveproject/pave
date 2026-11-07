import { Platform, Pressable, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Host, Icon, Row, RNHostView, Spacer, FieldGroup, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useSessionTrace } from '../../hooks/protestMode/useSessionTrace';
import type { ProtestDataSource } from '../../lib/protestMode/readSession';
import { ProtestTraceMap } from './components/ProtestTraceMap';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { Icons } from '../../constants/icons';

interface ProtestSessionDetailScreenProps {
  /** Overrides the route param, for a caller whose segment isn't named `id`. */
  sessionId?: string;
  /** Whose recording, when not the signed-in user's. */
  source?: ProtestDataSource;
}

const MAP_HEIGHT_RATIO = 0.32;

/**
 * One recording, as a summary: the trace as a figure, then a menu of
 * everything else it holds.
 *
 * The header is inside the `FieldGroup` too - a field group is a native list
 * with its own scroll, so anything left outside it would sit frozen above a
 * scrolling menu. It rides in its own section as a single `Row` hosting plain
 * RN views, as `settings/index` does for its `Avatar`.
 */
const ProtestSessionDetailScreen = ({
  sessionId,
  source,
}: ProtestSessionDetailScreenProps = {}) => {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = sessionId ?? params.id;
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const { colors, theme, mode } = useTheme();
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

  const rowBackground = Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined;
  const headerRowBackground =
    Platform.OS === 'ios' ? [listRowBackground(colors.background)] : undefined;

  const header = (
    <View style={{ gap: theme.spaces.sm, paddingVertical: theme.spaces.sm }}>
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
      <Text textColor="muted">{summary}</Text>

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
    </View>
  );

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
                ]
              : undefined
          }
        >
          {/* `matchContents: { vertical: true }` takes the width from the list
              row and the height from the children. Without it an `RNHostView`
              sizes itself to its SwiftUI parent and collapses to nothing. */}
          <FieldGroup.Section>
            <Row modifiers={headerRowBackground}>
              <RNHostView matchContents={{ vertical: true }}>{header}</RNHostView>
            </Row>
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Row
              spacing={theme.spaces.md}
              alignment="center"
              onPress={() =>
                router.push({ pathname: '/protest-session/[id]/audios', params: { id: id! } })
              }
              modifiers={rowBackground}
            >
              <Icon name={Icons.waveform} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.protest_mode.sessions.audio_recordings')}
              </NativeText>
              <Spacer flexible />
              <NativeText textStyle={{ color: colors.mutedForeground }}>
                {String(audio.length)}
              </NativeText>
              <Icon
                name={Icons.chevronRight}
                size={theme.icons.sizes.sm}
                color={colors.mutedForeground}
              />
            </Row>
            <Row
              spacing={theme.spaces.md}
              alignment="center"
              onPress={() =>
                router.push({ pathname: '/protest-session/[id]/videos', params: { id: id! } })
              }
              modifiers={rowBackground}
            >
              <Icon name={Icons.video} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.protest_mode.sessions.videos')}
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

export default ProtestSessionDetailScreen;
