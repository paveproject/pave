import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { Host, Icon, Row, Spacer, Switch, FieldGroup, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useTranslations } from 'use-intl';
import { useTheme } from '../providers/ThemeProvider';
import { useModalHeaderOptions } from '../hooks/useModalHeaderOptions';
import { useProtestMode } from '../hooks/useProtestMode';
import { View } from '../components/ui/view';
import { Icons } from '../constants/icons';

/**
 * Apple Music mini-player style: the always-visible accessory
 * (`ProtestModeAccessoryContent`, in `(tabs)/_layout.tsx`) only shows
 * status and opens this screen - the actual toggle lives here. Room for
 * more protest-mode-specific controls later (e.g. a shorter recovery
 * delay while it's on, surfaced from here rather than buried in
 * Settings > Recovery) - not built yet.
 */
const ProtestModeScreen = () => {
  const t = useTranslations();
  const { theme, colors, mode } = useTheme();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const { enabled, toggle } = useProtestMode();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: t('pages.protest_mode.title'), ...modalHeaderOptions }} />
      <Host style={{ flex: 1, width: '100%' }} seedColor={colors.foreground} colorScheme={mode}>
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
              alignment="center"
              spacing={theme.spaces.md}
              modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
            >
              <Icon
                name={Icons.megaphone}
                size={theme.icons.sizes.md}
                color={enabled ? colors.destructive : colors.foreground}
              />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.protest_mode.title')}
              </NativeText>
              <Spacer flexible />
              <Switch value={enabled} onValueChange={() => toggle()} />
            </Row>
            <FieldGroup.SectionFooter>
              <NativeText textStyle={{ color: colors.mutedForeground, textAlign: 'center' }}>
                {t('pages.protest_mode.description')}
              </NativeText>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
};

export default ProtestModeScreen;
