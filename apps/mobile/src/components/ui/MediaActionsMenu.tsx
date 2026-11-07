import { Alert, Pressable } from 'react-native';
import { Host, Icon } from '@expo/ui';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { Icons } from '../../constants/icons';

export interface MediaActionsMenuProps {
  /** Names the recording the actions apply to - the menu's own trigger says
   * nothing, so this is what a screen reader announces. */
  accessibilityLabel: string;
  onShare: () => void;
}

/**
 * The actions on one recording, behind an ellipsis.
 *
 * An `Alert` action list, which is the conventional Android pattern and the
 * fallback elsewhere. Metro swaps in `MediaActionsMenu.ios.tsx`, a native
 * SwiftUI `Menu`, on iOS - same arrangement as `Divider`.
 */
export const MediaActionsMenu = ({ accessibilityLabel, onShare }: MediaActionsMenuProps) => {
  const t = useTranslations();
  const { colors, theme, mode } = useTheme();
  const size = theme.icons.sizes.md;

  return (
    <Pressable
      onPress={() =>
        Alert.alert(
          accessibilityLabel,
          undefined,
          [
            { text: t('messages.share'), onPress: onShare },
            { text: t('messages.cancel'), style: 'cancel' },
          ],
          { userInterfaceStyle: mode },
        )
      }
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={theme.spaces.sm}
    >
      <Host style={{ width: size, height: size }}>
        <Icon name={Icons.ellipsis} size={size} color={colors.mutedForeground} />
      </Host>
    </Pressable>
  );
};
