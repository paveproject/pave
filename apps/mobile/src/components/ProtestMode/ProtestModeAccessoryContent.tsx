import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Host, Icon, Row, Text as NativeText } from '@expo/ui';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useProtestMode } from '../../hooks/useProtestMode';
import { Icons } from '../../constants/icons';

/**
 * The actual tappable content shown in the always-visible protest-mode
 * accessory - shared verbatim by both render paths (see
 * `(tabs)/_layout.tsx`): the native `NativeTabs.BottomAccessory` on iOS 26+,
 * and `ProtestModeFloatingBar`'s custom fallback everywhere else. Tapping
 * opens `/protest-mode` (the actual toggle lives there, Apple Music
 * mini-player style - this bar is a status + entry point, not a direct
 * toggle).
 */
export const ProtestModeAccessoryContent = () => {
  const t = useTranslations();
  const router = useRouter();
  const { theme, colors } = useTheme();
  const { enabled } = useProtestMode();

  return (
    <Pressable onPress={() => router.push('/protest-mode')}>
      <Host matchContents={{ horizontal: true, vertical: true }}>
        <Row spacing={theme.spaces.sm} alignment="center">
          <Icon
            name={Icons.megaphone}
            size={theme.icons.sizes.md}
            color={enabled ? colors.destructive : colors.foreground}
          />
          <NativeText textStyle={{ color: colors.foreground }}>
            {t('pages.protest_mode.title')}
          </NativeText>
          <NativeText textStyle={{ color: colors.mutedForeground }}>
            {enabled ? t('messages.on') : t('messages.off')}
          </NativeText>
        </Row>
      </Host>
    </Pressable>
  );
};
