import { Platform } from 'react-native';
import { Host, Row, Spacer, Picker, Icon, FieldGroup, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { useLocaleContext } from '../../../providers/LocaleProvider';
import { supportedLocales, type SupportedLocale } from '@libs/i18n';
import type { ThemeVariant } from '../../../stores/useUIStore';
import { View } from '../../../components/ui/view';
import { Icons } from '../../../constants/icons';

// Language names are shown in their own language, never translated - the
// standard convention for a language picker (so you can find yours even if
// the app is currently stuck in one you don't read).
const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  fr: 'Français',
};

const THEME_VARIANTS: ThemeVariant[] = ['system', 'light', 'dark'];

const AppearanceScreen = () => {
  const t = useTranslations();
  const { colors, theme, themePreference, setThemePreference } = useTheme();
  const { locale, setLocale } = useLocaleContext();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* FieldGroup is a scrollable container with no intrinsic size to
          hug - this Host must fill the available space, not matchContents. */}
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
              alignment="center"
              spacing={theme.spaces.md}
              modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
            >
              <Icon name={Icons.language} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('messages.language')}
              </NativeText>
              <Spacer flexible />
              <Picker selectedValue={locale} onValueChange={setLocale}>
                {supportedLocales.map((supportedLocale) => (
                  <Picker.Item
                    key={supportedLocale}
                    label={LOCALE_LABELS[supportedLocale]}
                    value={supportedLocale}
                  />
                ))}
              </Picker>
            </Row>
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Row
              alignment="center"
              spacing={theme.spaces.md}
              modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
            >
              <Icon name={Icons.appearance} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('messages.theme')}
              </NativeText>
              <Spacer flexible />
              <Picker selectedValue={themePreference} onValueChange={setThemePreference}>
                {THEME_VARIANTS.map((variant) => (
                  <Picker.Item key={variant} label={t(`messages.${variant}`)} value={variant} />
                ))}
              </Picker>
            </Row>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
};

export default AppearanceScreen;
