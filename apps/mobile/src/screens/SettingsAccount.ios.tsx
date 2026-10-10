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
import { Icon, RNHostView } from '@expo/ui';
import { useTranslations } from 'use-intl';
import { useTheme } from '../providers/ThemeProvider';
import { View } from '../components/ui/view';
import { FormFieldError } from '../components/ui/FormFieldError';
import { StatusBubble } from '../components/ui/StatusBubble';
import { Icons } from '../constants/icons';
import { Icons as LegacyIcons } from '../constants/IconsOld';
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
  const {
    form,
    canSave,
    isUsernameChecking,
    isUsernameAvailable,
    usernameError,
    isSaving,
    handleSave,
  } = useSettingsAccountForm();

  const usernameField = useNativeState(form.getValues('username'));
  const emailField = useNativeState(form.getValues('email'));

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
            {/* `footer` always gets a real element, never flips to
                `undefined` - `FormFieldError` itself collapses to zero
                size with no message, but toggling the PROP between
                `undefined` and an element makes SwiftUI add/remove the
                `Section`'s footer view entirely, which was rebuilding
                the `TextField` right above it (losing focus) exactly at
                the 0/`USERNAME_MIN` character boundaries where the error
                message starts/stops existing. */}
            <Section
              title={t('pages.settings.account.username.label')}
              footer={<FormFieldError message={usernameError} />}
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
                {isUsernameChecking ? (
                  <ProgressView />
                ) : isUsernameAvailable === true ? (
                  // Plain RN (`StatusBubble` has no native @expo/ui
                  // descendant), so it needs an explicit `RNHostView` to
                  // sit inside this raw SwiftUI `HStack` - unlike
                  // `FormFieldError` in the `footer` prop above, a bare
                  // RN child isn't auto-bridged here. `matchContents`:
                  // the bubble is small and fixed-size and should size
                  // from its own content, not stretch to fill the row.
                  <RNHostView matchContents>
                    <StatusBubble
                      color={colors.success}
                      iconColor={colors.successForeground}
                      icon={LegacyIcons.Check}
                    />
                  </RNHostView>
                ) : null}
              </HStack>
            </Section>

            <Section
              title={t('pages.settings.account.email.label')}
              footer={<FormFieldError message={emailError} />}
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
