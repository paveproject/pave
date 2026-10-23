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
 * Debug-only menu, reachable in dev builds (`__DEV__`) or once a user
 * triple-taps the version footer on `settings/index.tsx` (see
 * `useUIStore`'s `debug` flag, also gated in `settings/_layout.tsx`) - a
 * home for internal inspectors that have no business being user-facing by
 * default, without cluttering `settings/index.tsx` itself. Same list-row
 * convention as that screen; add one row per inspector as they're built.
 */
const DebugScreen = () => {
  const router = useRouter();
  const { colors, theme, mode } = useTheme();

  const handleRecoveryKeys = useCallback(() => {
    router.push('/settings/debug/recovery-keys');
  }, [router]);

  const handleSync = useCallback(() => {
    router.push('/settings/debug/sync');
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Host
        style={{ flex: 1, width: '100%' }}
        seedColor={colors.foreground}
        // Without this, Compose derives light/dark from the device setting
        // (`isSystemInDarkTheme()`), so a theme forced in-app renders the
        // Material palette of the opposite scheme.
        colorScheme={mode}
      >
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
            <Row
              spacing={theme.spaces.md}
              alignment="center"
              onPress={handleSync}
              modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
            >
              <Icon name={Icons.refresh} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>Sync</NativeText>
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
