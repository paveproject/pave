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
import { usePushMeField } from '../../../hooks/usePushMeField';
import { View } from '../../../components/ui/view';
import { Icons } from '../../../constants/icons';
import useLocalizedLanguageName from '../../../hooks/useLocalizedLanguageName';
import { useThemes } from '../../../hooks/useThemes';

const AppearanceScreen = () => {
  const t = useTranslations();
  const { colors, theme, mode, themePreference, setThemePreference } = useTheme();
  const { locale, setLocale } = useLocaleContext();
  const { user } = useAuth();
  const pushMeField = usePushMeField();
  const localizedLanguageNames = useLocalizedLanguageName();
  const themes = useThemes();

  const handleLocaleChange = useCallback(
    async (newLocale: string) => {
      setLocale(newLocale);
      if (!user) return;
      await pushMeField({ language: newLocale });
    },
    [setLocale, pushMeField, user],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
              <Icon name={Icons.language} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('messages.language')}
              </NativeText>
              <Spacer flexible />
              <Picker selectedValue={locale} onValueChange={handleLocaleChange}>
                {localizedLanguageNames.map(({ locale: supportedLocale, name }) => (
                  <Picker.Item key={supportedLocale} label={name} value={supportedLocale} />
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
                {themes.map((variant) => (
                  <Picker.Item key={variant.value} label={variant.label} value={variant.value} />
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
