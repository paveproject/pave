import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { View } from '../../../components/ui/view';
import { Text } from '../../../components/ui/text';
import type { ReadAudioChunk } from '../../../lib/protestMode/readSession';

const formatDuration = (ms: number): string => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * One segment, one player.
 *
 * Deliberately not a single player reused across segments: the decrypted
 * files are separate, and swapping a player's source mid-playback is how you
 * end up playing the previous segment's tail.
 */
const Segment = ({ chunk, index }: { chunk: ReadAudioChunk; index: number }) => {
  const { colors, theme } = useTheme();
  const format = useFormatter();
  const t = useTranslations();
  const player = useAudioPlayer({ uri: chunk.uri });
  const status = useAudioPlayerStatus(player);

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Back to the start when it has run to the end, or a second tap does
    // nothing at all.
    if (status.didJustFinish || player.currentTime >= player.duration) player.seekTo(0);
    player.play();
  }, [player, status.playing, status.didJustFinish]);

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={t('pages.protest_mode.sessions.audio_segment', { index: index + 1 })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spaces.md,
        paddingVertical: theme.spaces.sm,
      }}
    >
      {status.playing ? (
        <Pause size={theme.icons.sizes.md} color={colors.foreground} />
      ) : (
        <Play size={theme.icons.sizes.md} color={colors.foreground} />
      )}
      <Text style={{ flex: 1 }}>
        {format.dateTime(chunk.startedAt, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </Text>
      <Text textColor="muted" style={{ fontVariant: ['tabular-nums'] }}>
        {formatDuration(chunk.durationMs)}
      </Text>
    </Pressable>
  );
};

/** The session's audio, segment by segment, because that is how it was
 * recorded - the recorder is rotated so an uploaded chunk is safe before the
 * next one starts. The gaps between segments are real, and the UI says so
 * rather than presenting one seamless recording. */
export const AudioSegments = ({ chunks }: { chunks: ReadAudioChunk[] }) => {
  const { theme } = useTheme();
  const t = useTranslations();
  const [showGaps] = useState(() => chunks.some((chunk) => chunk.gapBeforeMs > 0));

  if (chunks.length === 0) return null;

  return (
    <View style={{ gap: theme.spaces.sm }}>
      <Text variant="title">{t('pages.protest_mode.sessions.audio')}</Text>
      {chunks.map((chunk, index) => (
        <Segment key={chunk.uri} chunk={chunk} index={index} />
      ))}
      {showGaps ? (
        <Text textColor="muted" style={{ fontSize: theme.fonts.sizes.xs }}>
          {t('pages.protest_mode.sessions.audio_gaps')}
        </Text>
      ) : null}
    </View>
  );
};
