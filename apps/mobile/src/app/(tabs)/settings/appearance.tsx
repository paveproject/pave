import { useCallback } from 'react';
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
import { useAuth } from '../../../providers/AuthProvider';
import { useLocaleContext } from '../../../providers/LocaleProvider';
import { useMeUpdateMutation } from '@libs/query-client';
import { setPendingLanguage } from '../../../lib/i18n';
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
  const { user } = useAuth();
  const { mutateAsync: updateMe } = useMeUpdateMutation();

  // The app is offline-first - picking a language must work with no
  // network at all, so `setLocale` (local, instant) never waits on this.
  // The account's `language` field is what the user's own pick gets
  // synced to (so e.g. emails/push notifications land in the right
  // language) - marked "pending" first so it survives being offline right
  // now: `AuthProvider` won't let the account's (stale) value override the
  // local pick while a sync is still pending, and `useLanguageSync` retries
  // this same push once a connection is back, in case this attempt below
  // fails. Signed out, there's no account row to update - local-only is
  // the only option, and also the correct one.
  const handleLocaleChange = useCallback(
    async (newLocale: string) => {
      setLocale(newLocale);
      if (!user) return;
      await setPendingLanguage(newLocale);
      try {
        await updateMe({ language: newLocale });
        await setPendingLanguage(null);
      } catch {
        // Offline (or the request otherwise failed) - stays pending,
        // `useLanguageSync` picks it up on the next reconnect.
      }
    },
    [setLocale, updateMe, user],
  );

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
              <Picker selectedValue={locale} onValueChange={handleLocaleChange}>
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
