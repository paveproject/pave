import { Platform } from 'react-native';
import { clamp } from 'lodash';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { Host, RNHostView } from '@expo/ui';
import { Button as SwiftUIButton } from '@expo/ui/swift-ui';
import { buttonBorderShape, buttonStyle, frame, labelStyle } from '@expo/ui/swift-ui/modifiers';
import { FilledTonalIconButton } from '@expo/ui/jetpack-compose';
import { fillMaxSize } from '@expo/ui/jetpack-compose/modifiers';
import { useTheme } from '../../providers/ThemeProvider';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MapSheetHeaderProps {
  title: string;
}

export const MapSheetHeader = ({ title }: MapSheetHeaderProps) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigationHeaderHeight = useHeaderHeight();
  const { colors, theme } = useTheme();
  const buttonSize = theme.input.height.md;

  const MIN_HEADER_HEIGHT = buttonSize + theme.spaces.vertical;
  const MAX_HEADER_HEIGHT = theme.input.height.lg * 1.5;
  const headerHeight = clamp(
    navigationHeaderHeight - insets.top,
    MIN_HEADER_HEIGHT,
    MAX_HEADER_HEIGHT,
  );

  return (
    <View
      style={{
        height: headerHeight,
        justifyContent: 'center',
        paddingHorizontal: theme.spaces.horizontal,
      }}
    >
      <Text
        variant="title"
        numberOfLines={1}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          textAlign: 'center',
          paddingHorizontal: buttonSize + theme.spaces.sm,
        }}
      >
        {title}
      </Text>
      <Host style={{ width: buttonSize, height: buttonSize, alignSelf: 'flex-start' }}>
        {Platform.OS === 'ios' ? (
          <SwiftUIButton
            label=""
            systemImage="xmark"
            onPress={() => router.back()}
            modifiers={[
              frame({ width: buttonSize, height: buttonSize }),
              buttonStyle('glass'),
              buttonBorderShape('circle'),
              labelStyle('iconOnly'),
            ]}
          />
        ) : (
          <FilledTonalIconButton onClick={() => router.back()} modifiers={[fillMaxSize()]}>
            <RNHostView>
              <X color={colors.foreground} size={theme.icons.sizes.sm} />
            </RNHostView>
          </FilledTonalIconButton>
        )}
      </Host>
    </View>
  );
};
