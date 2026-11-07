import { Host, Icon } from '@expo/ui';
import { Button as SwiftUIButton, Menu } from '@expo/ui/swift-ui';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { Icons } from '../../constants/icons';
import type { MediaActionsMenuProps } from './MediaActionsMenu';

/**
 * Native SwiftUI `Menu`. It opens on a plain tap precisely because no
 * `onPrimaryAction` is given - with one, a tap would run that action and the
 * menu would need a long press.
 */
export const MediaActionsMenu = ({ accessibilityLabel, onShare }: MediaActionsMenuProps) => {
  const t = useTranslations();
  const { colors, theme } = useTheme();
  const size = theme.icons.sizes.md;

  return (
    <Host
      matchContents
      style={{ width: size, height: size }}
      accessibilityLabel={accessibilityLabel}
    >
      <Menu label={<Icon name={Icons.ellipsis} size={size} color={colors.mutedForeground} />}>
        <SwiftUIButton
          systemImage="square.and.arrow.up"
          label={t('messages.share')}
          onPress={onShare}
        />
      </Menu>
    </Host>
  );
};
