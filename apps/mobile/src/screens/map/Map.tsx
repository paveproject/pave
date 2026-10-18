import { useMemo } from 'react';
import { Href, useRouter } from 'expo-router';
import { Host, RNHostView } from '@expo/ui';
import { buttonStyle, controlSize, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { fillMaxSize } from '@expo/ui/jetpack-compose/modifiers';
import { useTranslations } from 'use-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TriangleAlert, type LucideProps } from 'lucide-react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { Icon } from '../../components/ui/icon';
import { NativeButton } from '../../components/ui/NativeButton';

interface MapOption {
  background: string;
  foreground: string;
  icon: React.ComponentType<LucideProps>;
  label: string;
  href: Href;
}

const Map = () => {
  const router = useRouter();
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();

  const options = useMemo<MapOption[]>(
    () => [
      {
        background: colors.warning,
        foreground: colors.warningForeground,
        icon: TriangleAlert,
        label: t('messages.report'),
        href: '/map/report',
      },
    ],
    [colors, t],
  );

  return (
    <View
      style={{
        paddingTop: theme.spaces.vertical,
        paddingHorizontal: theme.spaces.horizontal,
        paddingBottom: insets.bottom + theme.spaces.vertical,
        gap: theme.spaces.sm,
      }}
    >
      {options.map((option) => (
        // Both axes are pinned to a concrete number here (width via `100%`,
        // height via a fixed value) - RNHostView's default
        // (non-matchContents) sizing fills whatever box the Button ends up
        // with, and that box is only unambiguous (no SwiftUI<->Yoga
        // measurement race, which is what dropped the label and let the icon
        // spill out before) when neither axis is left to "shrink to content".
        <Host key={option.label} style={{ width: '100%', height: theme.input.height.lg }}>
          <NativeButton
            onPress={() => router.push(option.href)}
            colors={{ containerColor: option.background, contentColor: option.foreground }}
            iosModifiers={[
              buttonStyle('glassProminent'),
              controlSize('extraLarge'),
              tint(option.background),
              frame({ maxWidth: Infinity, maxHeight: Infinity }),
            ]}
            androidModifiers={[fillMaxSize()]}
          >
            <RNHostView>
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: theme.spaces.sm,
                }}
              >
                <Icon name={option.icon} color={option.foreground} size={theme.icons.sizes.md} />
                <Text style={{ color: option.foreground }}>{option.label}</Text>
              </View>
            </RNHostView>
          </NativeButton>
        </Host>
      ))}
    </View>
  );
};

export default Map;
