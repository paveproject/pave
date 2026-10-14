import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Host, Icon, Row, TextInput, FieldGroup, Text as NativeText } from '@expo/ui';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useTranslations } from 'use-intl';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '../providers/ThemeProvider';
import { View } from '../components/ui/view';
import { FormFieldError } from '../components/ui/FormFieldError';
import { StatusBubble } from '../components/ui/StatusBubble';
import { FloatingFooter } from '../components/ui/FloatingFooter';
import { NativeButton } from '../components/ui/NativeButton';
import { Icons } from '../constants/icons';
import { Icons as LegacyIcons } from '../constants/IconsOld';
import { useSettingsAccountForm } from './useSettingsAccountForm';

/**
 * Android (and web) fallback - built on the universal `@expo/ui` components
 * (`FieldGroup`, `TextInput`), which map onto Jetpack Compose on this
 * platform (the iOS screen, `SettingsAccount.ios.tsx`, takes priority on
 * iOS, so no iOS-specific branching is needed here). Validation/save logic
 * lives in `useSettingsAccountForm`, shared with that iOS screen - only the
 * input rendering differs there, since the raw SwiftUI `TextField` needs an
 * `ObservableState` instead of a plain controlled `value`.
 */
const SettingsAccount = () => {
  const t = useTranslations();
  const { colors, theme, mode } = useTheme();
  const { form, canSave, isUsernameChecking, isUsernameAvailable, usernameError, handleSave } =
    useSettingsAccountForm();

  // See SettingsAccount.ios.tsx - `FloatingFooter` measures its own resting
  // height into this shared value instead of rendering its own spacer. A
  // `paddingBottom` on `FieldGroup` itself only shrinks the `LazyColumn`'s
  // outer frame, not its scrollable content padding, so a blank trailing
  // row (real scrollable content, sized to match) reserves the space instead.
  const footerHeight = useSharedValue(0);
  const [footerHeightPx, setFooterHeightPx] = useState(0);
  useAnimatedReaction(
    () => footerHeight.value,
    (value) => scheduleOnRN(setFooterHeightPx, value),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, gap: theme.spaces.md }}>
      <Host
        style={{ flex: 1, width: '100%' }}
        seedColor={colors.foreground}
        // Without this, Compose derives light/dark from the device setting
        // (`isSystemInDarkTheme()`), so a theme forced in-app renders the
        // Material palette of the opposite scheme.
        colorScheme={mode}
      >
        <FieldGroup style={{ backgroundColor: colors.background }}>
          <FieldGroup.Section>
            <Row spacing={theme.spaces.md} alignment="center">
              <Icon name={Icons.user} size={theme.icons.sizes.md} color={colors.foreground} />
              <TextInput
                style={{ width: '100%' }}
                textStyle={{ color: colors.foreground }}
                defaultValue={form.getValues('username')}
                placeholder={t('messages.username')}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(text) =>
                  form.setValue('username', text, { shouldValidate: true, shouldDirty: true })
                }
              />
              {isUsernameChecking ? (
                <ActivityIndicator />
              ) : isUsernameAvailable === true ? (
                <StatusBubble
                  color={colors.success}
                  iconColor={colors.successForeground}
                  icon={LegacyIcons.Check}
                />
              ) : null}
            </Row>
          </FieldGroup.Section>
          <FormFieldError message={usernameError} />

          <FieldGroup.Section>
            <Row spacing={theme.spaces.md} alignment="center">
              <Icon name={Icons.mail} size={theme.icons.sizes.md} color={colors.foreground} />
              <TextInput
                style={{ width: '100%' }}
                textStyle={{ color: colors.foreground }}
                defaultValue={form.getValues('email')}
                placeholder={t('messages.email')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={(text) =>
                  form.setValue('email', text, { shouldValidate: true, shouldDirty: true })
                }
              />
            </Row>
          </FieldGroup.Section>
          <FormFieldError message={form.formState.errors.email?.message} />

          {/* Blank trailing row reserving scroll space for the floating
              footer - see SettingsAccount.ios.tsx. */}
          <FieldGroup.Section>
            <Row style={{ height: footerHeightPx, backgroundColor: colors.background }} />
          </FieldGroup.Section>
        </FieldGroup>
      </Host>

      <FloatingFooter height={footerHeight}>
        <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
          <NativeButton
            disabled={!canSave}
            onPress={handleSave}
            colors={{
              containerColor: colors.secondary,
              contentColor: colors.secondaryForeground,
            }}
            androidModifiers={[fillMaxWidth()]}
          >
            <NativeText textStyle={{ color: colors.secondaryForeground }}>
              {t('messages.save')}
            </NativeText>
          </NativeButton>
        </Host>
      </FloatingFooter>
    </View>
  );
};

export default SettingsAccount;
