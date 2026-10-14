import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Host, Icon, Row, FieldGroup, Spacer, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../../../../providers/ThemeProvider';
import { View } from '../../../../components/ui/view';
import { Icons } from '../../../../constants/icons';

/**
 * `__DEV__`-only menu (see `settings/_layout.tsx`, also gated there) - a
 * home for internal inspectors that have no business being user-facing,
 * without cluttering `settings/index.tsx` itself. Same list-row
 * convention as that screen; add one row per inspector as they're built.
 */
const DebugScreen = () => {
  const router = useRouter();
  const { colors, theme } = useTheme();

  const handleRecoveryKeys = useCallback(() => {
    router.push('/settings/debug/recovery-keys');
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Host style={{ flex: 1, width: '100%' }} seedColor={colors.foreground}>
        <FieldGroup
          style={{ backgroundColor: colors.background }}
          modifiers={
            Platform.OS === 'ios'
              ? [
                  scrollContentBackground('hidden'),
                  background(colors.background),
                  tint(colors.foreground),
                ]
              : undefined
          }
        >
          <FieldGroup.Section>
            <Row
              spacing={theme.spaces.md}
              alignment="center"
              onPress={handleRecoveryKeys}
              modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
            >
              <Icon name={Icons.lock} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>Recovery keys</NativeText>
              <Spacer flexible />
              <Icon
                name={Icons.chevronRight}
                size={theme.icons.sizes.sm}
                color={colors.mutedForeground}
              />
            </Row>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
};

export default DebugScreen;
