import { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Host, Icon } from '@expo/ui';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { View } from '../../../components/ui/view';
import { Text } from '../../../components/ui/text';
import { Scrubber } from '../../../components/ui/Scrubber';
import { MediaActionsMenu } from '../../../components/ui/MediaActionsMenu';
import { shareMediaChunk } from '../../../lib/protestMode/shareMedia';
import { setPlaybackAudioMode } from '../../../lib/protestMode/audioMode';
import { useDecryptedMediaCleanup } from '../../../hooks/protestMode/useDecryptedMediaCleanup';
import { logger } from '../../../logger';
import { Icons } from '../../../constants/icons';
import type { ReadAudioChunk } from '../../../lib/protestMode/readSession';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Drawn into `Icons.skipBack`/`skipForward` - change both together. */
const SKIP_SECONDS = 10;

/** `useAudioPlayerStatus` polls rather than streams, so the bar is animated
 * across one interval instead of stepping twice a second. */
const STATUS_POLL_MS = 500;

/** `currentTime` lands just shy of `duration` as often as on it, so "has it
 * run out" cannot be an equality. */
const END_TOLERANCE_S = 0.25;

const formatClock = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const ControlButton = ({
  icon,
  size,
  label,
  onPress,
}: {
  icon: (typeof Icons)[keyof typeof Icons];
  size: number;
  label: string;
  onPress: () => void;
}) => {
  const { colors, theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.border.radius.full,
      }}
    >
      <Host style={{ width: size / 2, height: size / 2 }}>
        <Icon name={icon} size={size / 2} color={colors.foreground} />
      </Host>
    </Pressable>
  );
};

/** Its own component so the status ticks re-render this alone - subscribing
 * in the list would re-render every row twice a second. */
const PlayerPanel = ({ player }: { player: AudioPlayer }) => {
  const { theme } = useTheme();
  const t = useTranslations();
  const status = useAudioPlayerStatus(player);
  const progress = useSharedValue(0);
  const durationSv = useSharedValue(0);
  const isScrubbing = useSharedValue(false);

  const { currentTime, duration, playing, didJustFinish } = status;

  useEffect(() => {
    durationSv.set(duration);
  }, [duration, durationSv]);

  // In an effect, not in the render body: a shared-value write during render
  // tears under a concurrent re-render. Skipped while a finger is down, or
  // playback would drag the bar out from under it.
  useEffect(() => {
    if (isScrubbing.get()) return;
    const target = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    // The tick that ends a track already reports `playing: false`, so without
    // this the bar jumped the last interval instead of running out. The
    // position check keeps the rewind that follows a tap on `play` from
    // reading as another ending, which would flash the bar full.
    const landing = didJustFinish && duration > 0 && currentTime >= duration - END_TOLERANCE_S;
    progress.set(
      playing || landing
        ? withTiming(target, { duration: STATUS_POLL_MS, easing: Easing.linear })
        : target,
    );
  }, [currentTime, duration, playing, didJustFinish, progress, isScrubbing]);

  const seek = useCallback((seconds: number) => void player.seekTo(seconds), [player]);

  const toggle = useCallback(() => {
    if (playing) {
      player.pause();
      return;
    }
    // The seek has to land before `play`: on the final frame `play` is a
    // no-op, so an unawaited rewind needed a second tap to start.
    if (didJustFinish || (duration > 0 && currentTime >= duration - END_TOLERANCE_S)) {
      void player.seekTo(0).then(() => player.play());
      return;
    }
    player.play();
  }, [player, playing, didJustFinish, currentTime, duration]);

  const skip = useCallback(
    (by: number) => {
      const target = Math.min(Math.max(0, currentTime + by), duration || 0);
      void player.seekTo(target);
    },
    [player, currentTime, duration],
  );

  return (
    <View style={{ gap: theme.spaces.sm, paddingBottom: theme.spaces.md }}>
      <Scrubber progress={progress} duration={durationSv} isScrubbing={isScrubbing} onSeek={seek} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spaces.xl,
        }}
      >
        <ControlButton
          icon={Icons.skipBack}
          size={theme.spaces['3xl']}
          label={t('pages.protest_mode.sessions.skip_back', { seconds: SKIP_SECONDS })}
          onPress={() => skip(-SKIP_SECONDS)}
        />
        <ControlButton
          icon={playing ? Icons.pause : Icons.play}
          size={theme.spaces['4xl']}
          label={t(playing ? 'messages.pause' : 'messages.play')}
          onPress={toggle}
        />
        <ControlButton
          icon={Icons.skipForward}
          size={theme.spaces['3xl']}
          label={t('pages.protest_mode.sessions.skip_forward', { seconds: SKIP_SECONDS })}
          onPress={() => skip(SKIP_SECONDS)}
        />
      </View>
    </View>
  );
};

/**
 * A session's audio, segment by segment, with the transport inline under the
 * one being listened to.
 *
 * **One player for the whole list**, its source swapped with `replace`: one
 * per row would let two segments sound at once, and would hold a decoder open
 * for every segment of a three-hour recording.
 */
export const AudioSegmentList = ({
  chunks,
  onRefresh,
  isRefreshing,
}: {
  chunks: ReadAudioChunk[];
  onRefresh: () => Promise<unknown>;
  isRefreshing: boolean;
}) => {
  const { colors, theme } = useTheme();
  const t = useTranslations();
  const format = useFormatter();
  const reducedMotion = useReducedMotion();
  const player = useAudioPlayer();
  const cleanUpDecrypted = useDecryptedMediaCleanup();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);

  // Claimed here because nothing else does - see `audioMode`.
  useEffect(() => {
    setPlaybackAudioMode().catch((error) =>
      logger.error('protest: failed to claim the playback audio mode', { error }),
    );
  }, []);

  // Paused *then* cleaned: the decrypted files are plaintext recordings, and
  // this screen is the only reason they exist.
  useEffect(
    () => () => {
      player.pause();
      cleanUpDecrypted();
    },
    [player, cleanUpDecrypted],
  );

  const select = useCallback(
    (uri: string) => {
      if (uri === selected) {
        player.pause();
        setSelected(null);
        return;
      }
      player.pause();
      player.replace({ uri });
      setSelected(uri);
      player.play();
    },
    [player, selected],
  );

  return (
    <AnimatedLegendList
      data={chunks}
      // The blob id, not the uri: a chunk read from disk and the same chunk
      // read back from the server land in different cache files.
      keyExtractor={(chunk) => chunk.blobId}
      // Required: the list memoizes a row against its item, and `chunks` never
      // changes when the selection does - without this no row re-renders and
      // the tap appears to do nothing.
      extraData={selected}
      // Rows carry an expanded panel, so a recycled container would show the
      // previous row's state for a frame.
      recycleItems={false}
      itemLayoutAnimation={
        reducedMotion ? undefined : LinearTransition.duration(theme.animations.durations.md)
      }
      contentContainerStyle={{
        paddingTop: theme.spaces.vertical,
        paddingLeft: insets.left + theme.spaces.horizontal,
        paddingRight: insets.right + theme.spaces.horizontal,
        paddingBottom: insets.bottom + theme.spaces.vertical,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
      renderItem={({ item, index }) => (
        <View>
          {/* The menu is a *sibling* of the row's `Pressable`, not a child:
              nested inside it the parent won the responder, so tapping the
              ellipsis selected the row and closed it instead of opening the
              menu. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spaces.md,
              paddingVertical: theme.spaces.md,
            }}
          >
            <Pressable
              onPress={() => select(item.uri)}
              accessibilityRole="button"
              accessibilityState={{ selected: item.uri === selected }}
              accessibilityLabel={t('pages.protest_mode.sessions.audio_segment', {
                index: index + 1,
              })}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spaces.md,
              }}
            >
              <View style={{ flex: 1, gap: theme.spaces.xs }}>
                <Text style={{ fontWeight: '600' }}>
                  {t('pages.protest_mode.sessions.audio_segment', { index: index + 1 })}
                </Text>
                <Text textColor="muted" style={{ fontVariant: ['tabular-nums'] }}>
                  {format.dateTime(item.startedAt, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  {item.synced ? '' : ` · ${t('pages.protest_mode.sessions.not_sent_yet')}`}
                </Text>
              </View>
              {/* The duration gives way to the actions on the open row, as
                  Voice Memos does - the transport below already shows the
                  length, so the figure is redundant exactly there. */}
              {item.uri === selected ? null : (
                <Text textColor="muted" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatClock(item.durationMs / 1000)}
                </Text>
              )}
            </Pressable>
            {item.uri === selected ? (
              <MediaActionsMenu
                accessibilityLabel={t('pages.protest_mode.sessions.audio_segment', {
                  index: index + 1,
                })}
                onShare={() =>
                  void shareMediaChunk({
                    kind: 'audio',
                    uri: item.uri,
                    startedAt: item.startedAt,
                  })
                }
              />
            ) : null}
          </View>

          {item.uri === selected ? (
            <Animated.View
              entering={reducedMotion ? undefined : FadeIn.duration(180)}
              exiting={reducedMotion ? undefined : FadeOut.duration(120)}
            >
              <PlayerPanel player={player} />
            </Animated.View>
          ) : null}
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.muted }} />}
      ListFooterComponent={
        chunks.some((chunk) => chunk.gapBeforeMs > 0) ? (
          <Text
            textColor="muted"
            style={{ paddingTop: theme.spaces.md, fontSize: theme.fonts.sizes.xs }}
          >
            {t('pages.protest_mode.sessions.audio_gaps')}
          </Text>
        ) : null
      }
    />
  );
};
