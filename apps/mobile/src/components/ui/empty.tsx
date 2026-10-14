import type { IconName } from '@expo/ui';
import { Host, Icon as NativeIcon } from '@expo/ui';
import { useTranslations } from 'use-intl';
import { View } from './view';
import { Text } from './text';
import { useTheme } from '../../providers/ThemeProvider';

interface EmptyProps extends React.ComponentProps<typeof View> {
  /** Platform-native icon (SF Symbol / Material Symbol) - see `constants/icons.ts`. */
  icon: IconName;
  title?: string;
  iconSize?: number;
  iconColor?: string;
}

const Empty = ({ icon, title, iconSize, iconColor, style, ...props }: EmptyProps) => {
  const { theme, colors } = useTheme();
  const t = useTranslations();

  const size = iconSize ?? theme.icons.sizes.xl;

  return (
    <View style={[{ alignItems: 'center', gap: theme.spaces.md }, style]} {...props}>
      <Host style={{ width: size, height: size }}>
        <NativeIcon name={icon} size={size} color={iconColor ?? colors.mutedForeground} />
      </Host>
      <Text textColor="muted" style={{ textAlign: 'center', maxWidth: 220 }}>
        {title || t('messages.is_empty')}
      </Text>
    </View>
  );
};

export default Empty;
