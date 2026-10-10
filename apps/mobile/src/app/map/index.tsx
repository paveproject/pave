import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Host, Button } from '@expo/ui';
import {
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth, background as androidBackground } from '@expo/ui/jetpack-compose/modifiers';
import { Text as SwiftUIText } from '@expo/ui/swift-ui';
import { useTranslations } from 'use-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { View } from '../../components/ui/view';

const MapOptionsSheet = () => {
  const router = useRouter();
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();

  const handleReport = () => {
    router.push('/map/report');
  };

  const modifiers =
    Platform.OS === 'ios'
      ? [buttonStyle('glassProminent'), controlSize('extraLarge'), tint(colors.secondary)]
      : [fillMaxWidth(), androidBackground(colors.secondary)];

  return (
    <View
      style={{
        padding: theme.spaces.horizontal,
        paddingBottom: insets.bottom + theme.spaces.vertical,
      }}
    >
      <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
        <Button onPress={handleReport} modifiers={modifiers}>
          <SwiftUIText
            modifiers={[frame({ maxWidth: Infinity }), foregroundStyle(colors.secondaryForeground)]}
          >
            {t('messages.report')}
          </SwiftUIText>
        </Button>
      </Host>
    </View>
  );
};

export default MapOptionsSheet;
