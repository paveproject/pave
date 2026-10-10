import { Image } from 'react-native';
import { Icon } from '@expo/ui';
import { useTheme } from '../../providers/ThemeProvider';
import { Icons } from '../../constants/icons';
import { View } from './view';

interface AvatarProps {
  uri?: string | null;
  size: number;
}

// A plain RN component (Image) can be nested inside a plain RN View, but a
// native @expo/ui component (Icon) can't - once inside a plain subtree there
// is no way back into the native view tree, so the fallback renders the Icon
// directly (sized/clipped via its own `style`, not a wrapping View).
export const Avatar = ({ uri, size }: AvatarProps) => {
  const { colors } = useTheme();

  if (uri) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: colors.muted,
        }}
      >
        <Image source={{ uri }} style={{ width: size, height: size }} />
      </View>
    );
  }

  return (
    <Icon
      name={Icons.user}
      size={size * 0.6}
      color={colors.mutedForeground}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.muted }}
    />
  );
};
