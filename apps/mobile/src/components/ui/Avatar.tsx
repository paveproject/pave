import { Image } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Icons } from '../../constants/IconsOld';
import { View } from './view';

interface AvatarProps {
  uri?: string | null;
  size: number;
}

// Both branches render plain RN components on purpose - unlike `@expo/ui`'s
// native Icon, this never needs a `<Host>` ancestor, so Avatar is safe to
// drop into any tree (a native-UI screen or a plain list row alike).
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
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icons.User size={size * 0.6} color={colors.mutedForeground} />
    </View>
  );
};
