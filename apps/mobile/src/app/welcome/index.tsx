import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Share, ScrollView } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Host, Text as NativeText } from '@expo/ui';
import {
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useTranslations } from 'use-intl';
import {
  meOptions,
  useMeUpdateMutation,
  useSetRecoveryKeyMnemonicMutation,
} from '@libs/query-client';
import {
  commitMnemonicSetup,
  generateRecoveryMnemonic,
  planMnemonicSetup,
} from '../../lib/recoveryKey';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useToast } from '../../components/Toast';
import { useDeviceId } from '../../hooks/useDeviceId';
import { Input } from '../../components/ui/Input';
import { FormFieldError } from '../../components/ui/FormFieldError';
import { StatusBubble } from '../../components/ui/StatusBubble';
import { Checkbox } from '../../components/ui/checkbox';
import { NativeButton } from '../../components/ui/NativeButton';
import { Button } from '../../components/ui/Button';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { logger } from '../../logger';
import { Icons as LegacyIcons } from '../../constants/IconsOld';
import { useModalHeaderOptions } from '../../hooks/useModalHeaderOptions';
import { usernameSchema, useUsernameAvailabilityCheck } from '../../hooks/useUsernameValidation';
import { isAndroid, isIpad } from '../../platform/detection';

type Step = 'username' | 'recovery-phrase';

/**
 * One screen, one shared header/ScrollView/continue button - a single
 * flat screen is what lets this formSheet's `sheetAllowedDetents:
 * 'fitToContents'` (see `app/_layout.tsx`) actually measure its content;
 * a nested `<Stack>` (the previous shape) left it unable to see through
 * to the pushed screen's real content and rendered empty - every other
 * `fitToContents` sheet in this app (`validation/*`) is a single flat
 * screen for the same reason.
 *
 * `step` is local state, not navigation - "continuing" past the username
 * step never pushes anything, it just swaps which half of this component
 * renders (and what the shared button at the bottom does). `welcomed`
 * (and the ability to dismiss the sheet at all) is only ever set once
 * the recovery-phrase step's own explicit completion runs `finish()` -
 * dismissing before then (the username step's own header cross) just
 * leaves `useWelcomeGate` presenting this again next time, not stuck.
 */
const WelcomeScreen = () => {
  const t = useTranslations();
  const router = useRouter();
  const { colors, theme, mode } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: updateMe, isPending: isSavingUsername } = useMeUpdateMutation();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const insets = useSafeAreaInsets();
  const navigationHeaderHeight = useHeaderHeight();
  const bottomInset = isIpad ? insets.bottom : 0;

  const [step, setStep] = useState<Step>('username');

  const finishPromiseRef = useRef<Promise<void> | null>(null);
  const finish = useCallback(() => {
    if (!finishPromiseRef.current) {
      const previous = queryClient.getQueryData(meOptions().queryKey);
      if (previous && previous.welcomedAt == null) {
        queryClient.setQueryData(meOptions().queryKey, (old) =>
          old ? { ...old, welcomedAt: new Date().toISOString() } : old,
        );
      }
      finishPromiseRef.current = updateMe({ welcomed: true })
        .then(() => undefined)
        .catch(() => {
          if (previous) queryClient.setQueryData(meOptions().queryKey, previous);
        });
    }
    return finishPromiseRef.current;
  }, [updateMe, queryClient]);

  // ---------------------------------------------------------------------
  // Step 1: username
  // ---------------------------------------------------------------------
  const schema = useMemo(() => z.object({ username: usernameSchema(t) }), [t]);
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: user?.username ?? '' },
    mode: 'onChange',
  });

  const username = form.watch('username');
  const { isUsernameChecking, isUsernameAvailable } = useUsernameAvailabilityCheck(
    form,
    user?.username,
  );

  const usernameChanged = username !== (user?.username ?? '');
  const usernameError =
    form.formState.errors.username?.message ??
    (isUsernameAvailable === false ? t('messages.username_unavailable') : undefined);

  const canContinueUsername =
    !isSavingUsername &&
    !isUsernameChecking &&
    form.formState.isValid &&
    isUsernameAvailable !== false;

  const handleContinueUsername = form.handleSubmit(async (values) => {
    try {
      if (usernameChanged) {
        await updateMe({ username: values.username });
      }
      setStep('recovery-phrase');
    } catch (error) {
      toast.error(t('messages.an_error_occurred'));
      logger.error('welcome save error', { error });
    }
  });

  // ---------------------------------------------------------------------
  // Step 2: recovery phrase - the mandatory, non-dismissible step that
  // actually finishes the flow.
  // ---------------------------------------------------------------------
  const deviceId = useDeviceId();
  const setMnemonic = useSetRecoveryKeyMnemonicMutation();

  const [confirmed, setConfirmed] = useState(false);
  const [isSavingPhrase, setIsSavingPhrase] = useState(false);
  const mnemonic = useMemo(() => generateRecoveryMnemonic(), []);
  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);

  useEffect(() => {
    if (step !== 'recovery-phrase' || !user?.hasRecoveryPhrase) return;
    finish().then(() => router.dismiss());
  }, [step, user?.hasRecoveryPhrase, finish, router]);

  const handleCopyPhrase = useCallback(async () => {
    await Clipboard.setStringAsync(mnemonic);
    // "la phrase" is feminine in French - `messages.copied` agrees with it.
    toast.success(t('messages.copied', { count: 1, gender: 'female' }));
  }, [mnemonic, toast, t]);

  const handleSharePhrase = useCallback(() => {
    Share.share({ message: mnemonic }).catch((error) => {
      logger.error('recovery phrase share failed', { error });
    });
  }, [mnemonic]);

  const handleContinuePhrase = useCallback(async () => {
    if (!user || !deviceId) return;
    setIsSavingPhrase(true);
    try {
      const plan = await planMnemonicSetup(user.id, deviceId, mnemonic);
      await setMnemonic.mutateAsync({ encryptedDek: plan.encryptedDek });
      await commitMnemonicSetup(user.id, plan.derivedKey, plan.dekFingerprint);
      await finish();
      router.dismiss();
    } catch (error) {
      toast.error(t('messages.an_error_occurred'));
      logger.error('recovery phrase setup error', { error });
    } finally {
      setIsSavingPhrase(false);
    }
  }, [user, deviceId, mnemonic, setMnemonic, finish, router, toast, t]);

  const canContinuePhrase = confirmed && !!deviceId && !isSavingPhrase;

  if (step === 'recovery-phrase' && user?.hasRecoveryPhrase) return null;

  // ---------------------------------------------------------------------
  // Shared shell: one Stack.Screen, one ScrollView, one continue button -
  // only the content in between and the header's dismissibility change
  // per step.
  // ---------------------------------------------------------------------
  const title =
    step === 'username' ? t('messages.welcome') : t('pages.welcome.recovery_phrase.title');
  const headerOptions =
    step === 'username'
      ? { ...modalHeaderOptions, title }
      : {
          title,
          headerBackVisible: false,
          headerLeft: () => null,
          gestureEnabled: false,
          ...(isAndroid ? { headerShown: false } : {}),
        };

  const canContinue = step === 'username' ? canContinueUsername : canContinuePhrase;
  const isContinuing = step === 'username' ? isSavingUsername : isSavingPhrase;
  const continueLabel = step === 'username' ? t('messages.continue') : t('messages.finish');

  // The recovery-phrase step gets an extra, deliberately heavy-handed
  // confirmation - there's no support fallback if it turns out the user
  // never actually wrote the phrase down (see this file's own doc comment
  // on why: the phrase itself is never stored anywhere, only the fact
  // that it once existed).
  const handleContinuePress = () => {
    if (step === 'username') {
      handleContinueUsername();
      return;
    }
    Alert.alert(
      t('pages.welcome.recovery_phrase.finish_confirm_title'),
      t('pages.welcome.recovery_phrase.finish_confirm_message'),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        { text: t('messages.finish'), onPress: handleContinuePhrase },
      ],
      { userInterfaceStyle: mode },
    );
  };

  const continueIosModifiers = [
    buttonStyle('glassProminent'),
    controlSize('extraLarge'),
    tint(colors.secondary),
    foregroundStyle(colors.secondaryForeground),
  ];
  const continueLabelModifiers =
    Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()];

  return (
    <>
      <Stack.Screen options={headerOptions} />
      <ScrollView
        bounces={false}
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: bottomInset + theme.spaces.vertical }}
      >
        {/* Only the recovery-phrase step hides the native header (no
            dismiss affordance on Android) - the username step keeps its
            native header (and cross) on both platforms, unchanged. */}
        {isAndroid && step === 'recovery-phrase' && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingTop: theme.spaces.sm,
              paddingBottom: theme.spaces.sm,
              paddingLeft: insets.left + theme.spaces.horizontal,
              paddingRight: insets.right + theme.spaces.horizontal,
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
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
          {step === 'username' ? (
            <>
              <View style={{ gap: theme.spaces.sm }}>
                <Text variant="title">{t('messages.welcome')}</Text>
                <Text textColor="muted">{t('pages.welcome.description')}</Text>
              </View>

              <Controller
                name="username"
                control={form.control}
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    nativeID="username"
                    placeholder={t('messages.username')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    disabled={isSavingUsername}
                    rightComponent={
                      isUsernameChecking ? (
                        <ActivityIndicator />
                      ) : isUsernameAvailable === true ? (
                        <StatusBubble
                          color={colors.success}
                          iconColor={colors.successForeground}
                          icon={LegacyIcons.Check}
                        />
                      ) : undefined
                    }
                  />
                )}
              />
              <FormFieldError message={usernameError} />
            </>
          ) : (
            <>
              <View style={{ gap: theme.spaces.sm }}>
                <Text variant="title">{t('pages.welcome.recovery_phrase.title')}</Text>
                <Text textColor="muted">{t('pages.welcome.recovery_phrase.description')}</Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: theme.spaces.sm,
                  padding: theme.spaces.md,
                  borderRadius: theme.border.radius.md,
                  backgroundColor: colors.muted,
                }}
              >
                {words.map((word, index) => (
                  <View
                    key={index}
                    style={{ width: '45%', flexDirection: 'row', gap: theme.spaces.xs }}
                  >
                    <Text textColor="muted">{index + 1}.</Text>
                    <Text style={{ fontWeight: '600' }}>{word}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: theme.spaces.sm }}>
                <Button
                  variant="muted"
                  icon={LegacyIcons.Duplicate}
                  onPress={handleCopyPhrase}
                  style={{ flex: 1 }}
                >
                  {t('messages.copy')}
                </Button>
                <Button
                  variant="muted"
                  icon={LegacyIcons.Share}
                  onPress={handleSharePhrase}
                  style={{ flex: 1 }}
                >
                  {t('messages.save')}
                </Button>
              </View>

              <View
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spaces.sm }}
              >
                <Checkbox checked={confirmed} onCheckedChange={setConfirmed} />
                {/* Own touch target, separate from the checkbox's - tapping
                    the checkbox icon itself used to also bubble up to a
                    wrapping `onTouchEnd` here, double-toggling (on then
                    immediately back off) so the box never visibly checked. */}
                <Pressable style={{ flex: 1 }} onPress={() => setConfirmed((prev) => !prev)}>
                  <Text>{t('pages.welcome.recovery_phrase.confirm_label')}</Text>
                </Pressable>
              </View>
            </>
          )}

          <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
            <NativeButton
              disabled={!canContinue || isContinuing}
              onPress={handleContinuePress}
              colors={{
                containerColor: colors.secondary,
                contentColor: colors.secondaryForeground,
              }}
              iosModifiers={continueIosModifiers}
              androidModifiers={[fillMaxWidth()]}
            >
              <NativeText
                textStyle={{ color: colors.secondaryForeground, textAlign: 'center' }}
                modifiers={continueLabelModifiers}
              >
                {continueLabel}
              </NativeText>
            </NativeButton>
          </Host>
        </View>
      </ScrollView>
    </>
  );
};

export default WelcomeScreen;
