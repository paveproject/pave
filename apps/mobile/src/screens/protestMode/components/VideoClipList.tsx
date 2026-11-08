import { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { View } from '../../../components/ui/view';
import { Text } from '../../../components/ui/text';
import { MediaActionsMenu } from '../../../components/ui/MediaActionsMenu';
import { shareMediaChunk } from '../../../lib/protestMode/shareMedia';
import type { ReadVideoChunk } from '../../../lib/protestMode/readSession';
import { useDecryptedMediaCleanup } from '../../../hooks/protestMode/useDecryptedMediaCleanup';

/** 16:9, the shape every clip is recorded in (`VIDEO_QUALITY`). */
const ASPECT_RATIO = 16 / 9;

const formatClock = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * A session's clips, the selected one playing inline.
 *
 * **One player for the whole list**, its source swapped with `replace`: one
 * per row would hold a decoder open for every clip and let two sound at once.
 */
export const VideoClipList = ({
  clips,
  onRefresh,
  isRefreshing,
}: {
  clips: ReadVideoChunk[];
  onRefresh: () => Promise<unknown>;
  isRefreshing: boolean;
}) => {
  const { colors, theme } = useTheme();
  const t = useTranslations();
  const format = useFormatter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);

  const player = useVideoPlayer(null);
  const cleanUpDecrypted = useDecryptedMediaCleanup();

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
      data={clips}
      // The blob id, not the uri: a clip read from disk and the same clip read
      // back from the server land in different cache files.
      keyExtractor={(clip) => clip.blobId}
      // Same reason as the audio list: a row is memoized against its item, and
      // `clips` never changes when the selection does.
      extraData={selected}
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
              accessibilityLabel={t('pages.protest_mode.sessions.video_clip', { index: index + 1 })}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spaces.md,
              }}
            >
              <View style={{ flex: 1, gap: theme.spaces.xs }}>
                <Text style={{ fontWeight: '600' }}>
                  {t('pages.protest_mode.sessions.video_clip', { index: index + 1 })}
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
              {/* The duration gives way to the actions on the open row: the
                  player below already shows the length. */}
              {item.uri === selected ? null : (
                <Text textColor="muted" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatClock(item.durationMs / 1000)}
                </Text>
              )}
            </Pressable>
            {item.uri === selected ? (
              <MediaActionsMenu
                accessibilityLabel={t('pages.protest_mode.sessions.video_clip', {
                  index: index + 1,
                })}
                onShare={() =>
                  void shareMediaChunk({
                    kind: 'video',
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
              style={{ paddingBottom: theme.spaces.md }}
            >
              {/* The player's own controls rather than the audio list's
                  transport: a video view already draws a full set, and
                  `VideoView` owns its surface - an overlay of ours would sit
                  on top of the frame it is meant to reveal. */}
              <VideoView
                player={player}
                style={{
                  width: '100%',
                  aspectRatio: ASPECT_RATIO,
                  borderRadius: theme.border.radius.lg,
                  backgroundColor: colors.muted,
                }}
                contentFit="contain"
                fullscreenOptions={{ enable: true }}
              />
            </Animated.View>
          ) : null}
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.muted }} />}
    />
  );
};
