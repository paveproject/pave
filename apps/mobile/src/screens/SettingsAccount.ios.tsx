import {
  Host,
  Form,
  Section,
  HStack,
  TextField,
  ProgressView,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  background,
  frame,
  keyboardType,
  listRowBackground,
  scrollContentBackground,
  textInputAutocapitalization,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Icon } from '@expo/ui';
import { useTranslations } from 'use-intl';
import { useTheme } from '../providers/ThemeProvider';
import { View } from '../components/ui/view';
import { FormFieldError } from '../components/ui/FormFieldError';
import { Icons } from '../constants/icons';
import { useSettingsAccountForm } from './useSettingsAccountForm';
import { Stack } from 'expo-router';

/**
 * iOS-only: uses the raw SwiftUI `Form`/`TextField`/`Section` (from
 * `@expo/ui/swift-ui`) instead of the universal `FieldGroup`/`TextInput`
 * wrappers. Validation/save logic itself lives in `useSettingsAccountForm`,
 * shared with the Android screen (`SettingsAccount.tsx`) - only the input
 * rendering differs, since the raw `TextField` is seeded once via
 * `useNativeState` rather than taking a reactive `value` prop.
 */
const SettingsAccount = () => {
  const t = useTranslations();
  const { colors, theme } = useTheme();
  const { form, canSave, isUsernameChecking, isSaving, handleSave } = useSettingsAccountForm();

  const usernameField = useNativeState(form.getValues('username'));
  const emailField = useNativeState(form.getValues('email'));

  const usernameError = form.formState.errors.username?.message;
  const emailError = form.formState.errors.email?.message;

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button disabled={!canSave || isSaving} onPress={handleSave}>
          {t('messages.save')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Host style={{ flex: 1 }}>
          <Form
            modifiers={[
              scrollContentBackground('hidden'),
              background(colors.background),
              tint(colors.foreground),
            ]}
          >
            <Section
              title={t('pages.settings.account.username.label')}
              footer={usernameError ? <FormFieldError message={usernameError} /> : undefined}
            >
              <HStack
                spacing={theme.spaces.md}
                alignment="center"
                modifiers={[listRowBackground(colors.muted)]}
              >
                <Icon
                  name={Icons.user}
                  size={theme.icons.sizes.sm}
                  color={colors.mutedForeground}
                />
                <TextField
                  text={usernameField}
                  placeholder={t('pages.settings.account.username.label')}
                  onTextChange={(text) =>
                    form.setValue('username', text, { shouldValidate: true, shouldDirty: true })
                  }
                  modifiers={[
                    frame({ maxWidth: Infinity }),
                    textInputAutocapitalization('never'),
                    autocorrectionDisabled(true),
                  ]}
                />
                {isUsernameChecking ? <ProgressView /> : null}
              </HStack>
            </Section>

            <Section
              title={t('pages.settings.account.email.label')}
              footer={emailError ? <FormFieldError message={emailError} /> : undefined}
            >
              <HStack
                spacing={theme.spaces.md}
                alignment="center"
                modifiers={[listRowBackground(colors.muted)]}
              >
                <Icon
                  name={Icons.mail}
                  size={theme.icons.sizes.sm}
                  color={colors.mutedForeground}
                />
                <TextField
                  text={emailField}
                  placeholder={t('pages.settings.account.email.label')}
                  onTextChange={(text) =>
                    form.setValue('email', text, { shouldValidate: true, shouldDirty: true })
                  }
                  modifiers={[
                    frame({ maxWidth: Infinity }),
                    textInputAutocapitalization('never'),
                    autocorrectionDisabled(true),
                    keyboardType('email-address'),
                  ]}
                />
              </HStack>
            </Section>
          </Form>
        </Host>
      </View>
    </>
  );
};

export default SettingsAccount;
