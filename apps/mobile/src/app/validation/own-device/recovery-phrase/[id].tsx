import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Host, Text as NativeText } from '@expo/ui';
import {
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useTranslations } from 'use-intl';
import { getRecoveryKeyMnemonic, listDevices, listTrustedContacts } from '@libs/api-js';
import {
  devicesOptions,
  isForbiddenError,
  pendingActionsOptions,
  trustedContactsOptions,
  useActivateRecoveryKeyMnemonicMutation,
} from '@libs/query-client';
import {
  adoptMnemonicDek,
  decryptDekWithMnemonic,
  finalizeMnemonicRecovery,
  isValidRecoveryMnemonic,
} from '../../../../lib/recoveryKey';
import { useAuth } from '../../../../providers/AuthProvider';
import { useTheme } from '../../../../providers/ThemeProvider';
import { useToast } from '../../../../components/Toast';
import { useModalHeaderOptions } from '../../../../hooks/useModalHeaderOptions';
import { Input } from '../../../../components/ui/Input';
import { FormFieldError } from '../../../../components/ui/FormFieldError';
import { NativeButton } from '../../../../components/ui/NativeButton';
import { Button } from '../../../../components/ui/Button';
import { View } from '../../../../components/ui/view';
import { Text } from '../../../../components/ui/text';
import { isAndroid, isIpad } from '../../../../platform/detection';
import { Icons } from '../../../../constants/IconsOld';
import { logger } from '../../../../logger';
import tw from '../../../../lib/tw';

/**
 * The 3rd recovery path, reached from `validation/own-device/[id].tsx`'s
 * "No access?" choice - unlike the trusted-contacts quorum flow, this
 * activates the device immediately: no delay, nothing to wait on. A
 * wrong phrase just fails the local decrypt (AEAD auth failure) - there's
 * no server-side guess to lock out, so retrying costs nothing. Its own
 * dismissible formSheet (unlike `/welcome`'s) - getting the phrase wrong
 * or changing your mind isn't destructive, so there's no reason to trap
 * the user in it; closing it just drops back to the "No access?" choice.
 *
 * Success dismisses *every* presented sheet (`dismissAll`, not `back`) -
 * recovery is now fully resolved, there's nothing left underneath worth
 * showing (the own-device sheet beneath this one would otherwise linger
 * until its own `usePendingAction` effect notices and closes it).
 */
const RecoveryPhraseEntryScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const router = useRouter();
  const { theme, colors, isLiquidGlassAvailable } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const activate = useActivateRecoveryKeyMnemonicMutation();
  const insets = useSafeAreaInsets();
  const navigationHeaderHeight = useHeaderHeight();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const bottomInset = isIpad || isAndroid ? insets.bottom : 0;

  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setError(undefined);

    if (!isValidRecoveryMnemonic(phrase)) {
      setError(t('pages.pending_actions.own_device.mnemonic.invalid'));
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, response } = await getRecoveryKeyMnemonic();
      if (response.status === 404 || !data) {
        setError(t('pages.pending_actions.own_device.mnemonic.wrong_phrase'));
        return;
      }

      let dek: Uint8Array;
      try {
        dek = decryptDekWithMnemonic(data.encryptedDek, phrase);
      } catch {
        setError(t('pages.pending_actions.own_device.mnemonic.wrong_phrase'));
        return;
      }

      await adoptMnemonicDek(user.id, dek, id);

      try {
        await activate.mutateAsync();
      } catch (activateError) {
        // Already active means a previous attempt already succeeded
        // server-side, just before this client's own cache caught up
        // (e.g. a retry after a dropped response) - the goal state is
        // already true, so this is a success too, not a failure.
        if (!isForbiddenError(activateError)) throw activateError;
      }

      // Fresh, not cached - activating may have also restored sibling
      // devices suspended by an in-flight trusted-contacts request (see
      // `activate_via_recovery_key_mnemonic`'s own doc comment), and the
      // 403-as-success path above never ran the mutation's own
      // `onSuccess` cache updates.
      const [{ data: devices }, { data: contacts }] = await Promise.all([
        listDevices(),
        listTrustedContacts(),
      ]);
      if (devices) queryClient.setQueryData(devicesOptions().queryKey, devices);
      if (contacts) queryClient.setQueryData(trustedContactsOptions().queryKey, contacts);
      await queryClient.invalidateQueries({ queryKey: pendingActionsOptions().queryKey });

      const eligibleContactIds = (contacts ?? [])
        .filter(
          (row): row is typeof row & { contact: NonNullable<(typeof row)['contact']> } =>
            row.status === 'accepted' && !!row.contact && row.contact.devices.length > 0,
        )
        .map((row) => row.contact.id);
      // Only `active` devices count as "own" for the DEK-bearing set this
      // device records for itself (see `planReconciliation`'s own doc
      // comment) - by this point in the flow the fresh refetch above
      // already reflects this device's own activation and every sibling's
      // suspension, so filtering to `active` alone is enough; there's no
      // need for this screen's own special-case for "myself, regardless
      // of my current row" the way `useRecoveryRequestCompletion` needs.
      const ownDeviceIds = (devices ?? [])
        .filter((device) => device.status === 'active')
        .map((device) => device.id);

      await finalizeMnemonicRecovery(user.id, dek, phrase, eligibleContactIds, ownDeviceIds);

      router.dismissAll();
    } catch (err) {
      toast.error(t('messages.an_error_occurred'));
      logger.error('recovery via mnemonic failed', { error: err });
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = t('pages.pending_actions.own_device.mnemonic.title');

  return (
    <>
      <Stack.Screen options={isAndroid ? { headerShown: false } : modalHeaderOptions} />
      <ScrollView
        bounces={false}
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: bottomInset + theme.spaces.vertical }}
      >
        {isAndroid && (
          <View
            style={[
              tw`flex-row items-center`,
              {
                paddingTop: theme.spaces.sm,
                paddingBottom: theme.spaces.sm,
                paddingLeft: insets.left + theme.spaces.horizontal,
                paddingRight: insets.right + theme.spaces.horizontal,
              },
            ]}
          >
            <Button
              variant="muted"
              size="icon"
              icon={Icons.X}
              disabled={isSubmitting}
              onPress={() => router.dismiss()}
              style={tw`rounded-full`}
            />
            <View pointerEvents="none" style={tw`items-center justify-center absolute inset-0`}>
              <Text variant="title" numberOfLines={1}>
                {title}
              </Text>
            </View>
          </View>
        )}
        <View
          style={{
            gap: theme.spaces.md,
            paddingTop: navigationHeaderHeight + theme.spaces.vertical,
            paddingLeft: insets.left + theme.spaces.horizontal,
            paddingRight: insets.right + theme.spaces.horizontal,
          }}
        >
          <Text textColor="muted">
            {t('pages.pending_actions.own_device.mnemonic.description')}
          </Text>

          <Input
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('pages.pending_actions.own_device.mnemonic.placeholder')}
            value={phrase}
            onChangeText={(value) => {
              setPhrase(value);
              setError(undefined);
            }}
            disabled={isSubmitting}
          />
          <FormFieldError message={error} />

          <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
            <NativeButton
              disabled={isSubmitting || phrase.trim().length === 0}
              onPress={handleSubmit}
              colors={{
                containerColor: colors.secondary,
                contentColor: colors.secondaryForeground,
              }}
              iosModifiers={[
                buttonStyle(isLiquidGlassAvailable ? 'glassProminent' : 'borderedProminent'),
                controlSize('extraLarge'),
                tint(colors.secondary),
                foregroundStyle(colors.secondaryForeground),
              ]}
            >
              <NativeText
                textStyle={{ color: colors.secondaryForeground, textAlign: 'center' }}
                modifiers={[frame({ maxWidth: Infinity })]}
              >
                {t('pages.pending_actions.own_device.mnemonic.continue')}
              </NativeText>
            </NativeButton>
          </Host>
        </View>
      </ScrollView>
    </>
  );
};

export default RecoveryPhraseEntryScreen;
