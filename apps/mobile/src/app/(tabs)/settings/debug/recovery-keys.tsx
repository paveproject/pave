import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Host, Icon, Row, FieldGroup, Spacer, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  refreshable,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { PullToRefreshBox } from '@expo/ui/jetpack-compose';
import { setStringAsync } from 'expo-clipboard';
import { useTranslations } from 'use-intl';
import {
  devicesOptions,
  trustedByOptions,
  trustedContactsOptions,
  useRevokeDeviceMutation,
} from '@libs/query-client';
import {
  getDebugSnapshot,
  getReceivedShareDebugInfo,
  wipeOwnRecoveryState,
  type RecoveryKeyDebugSnapshot,
} from '../../../../lib/recoveryKey';
import { View } from '../../../../components/ui/view';
import { useTheme } from '../../../../providers/ThemeProvider';
import { useDeviceId } from '../../../../hooks/useDeviceId';
import { useToast } from '../../../../components/Toast';
import { Icons } from '../../../../constants/icons';

type Theme = ReturnType<typeof useTheme>;

/**
 * A label/value settings row - tappable to copy the *raw* value (`copyValue`,
 * since `value` itself may be a truncated/formatted display string) when
 * `copyValue` is a non-empty string. `copyGender` picks the French past
 * participle's agreement in the `messages.copied` toast (`male`/`female`,
 * matching the copied value's own grammatical gender, e.g. "la clé" ->
 * `female`, "l'identifiant" -> `male`) - irrelevant in English, where the
 * dictionary entry ignores both params.
 */
const InfoRow = ({
  label,
  value,
  copyValue,
  copyGender = 'male',
  theme,
  colors,
}: {
  label: string;
  value: string;
  copyValue?: string | null;
  copyGender?: 'male' | 'female';
  theme: Theme['theme'];
  colors: Theme['colors'];
}) => {
  const t = useTranslations();
  const toast = useToast();

  const handleCopy = useCallback(async () => {
    if (!copyValue) return;
    await setStringAsync(copyValue);
    toast.success(t('messages.copied', { count: 1, gender: copyGender }));
  }, [copyValue, copyGender, toast, t]);

  return (
    <Row
      spacing={theme.spaces.md}
      alignment="center"
      onPress={copyValue ? handleCopy : undefined}
      modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
    >
      <NativeText textStyle={{ color: colors.foreground }}>{label}</NativeText>
      <Spacer flexible />
      <NativeText
        textStyle={{ color: colors.mutedForeground, textAlign: 'right' }}
        numberOfLines={1}
      >
        {value}
      </NativeText>
    </Row>
  );
};

/**
 * `__DEV__`-only inspector for `lib/recoveryKey`'s local state (see
 * `settings/debug/index.tsx`). Nothing user-facing consumes this state
 * yet - the recovery-reconstruction flow is a later phase - so this is
 * the only way to confirm the app-wide sync (`Providers.tsx`'s
 * `RecoveryKeyBootstrap`) actually ran, without digging through Metro
 * logs or the database by hand. Never shows the DEK, private key or a
 * raw share - only presence and, for the DEK, a one-way fingerprint (see
 * `getDebugSnapshot`'s own doc comment).
 */
const RecoveryKeysDebugScreen = () => {
  const { theme, colors, mode } = useTheme();
  const deviceId = useDeviceId();
  const [snapshot, setSnapshot] = useState<RecoveryKeyDebugSnapshot | null>(null);
  const [receivedShares, setReceivedShares] = useState<Record<string, string>>({});

  const mine = useQuery(trustedContactsOptions());
  const asContact = useQuery({ ...trustedByOptions(deviceId ?? undefined), enabled: !!deviceId });
  const devices = useQuery(devicesOptions());
  const asContactRows = asContact.data;
  const revokeDevice = useRevokeDeviceMutation();

  const reload = useCallback(async () => {
    setSnapshot(await getDebugSnapshot());
    const entries = await Promise.all(
      (asContactRows ?? []).map(async (row) => {
        const info = await getReceivedShareDebugInfo(row.owner.id);
        const value = info.present ? `gen ${info.generation}, t=${info.threshold}` : 'none';
        return [row.owner.id, value] as const;
      }),
    );
    setReceivedShares(Object.fromEntries(entries));
  }, [asContactRows]);

  useEffect(() => {
    reload();
  }, [reload]);

  const refreshing = mine.isRefetching || asContact.isRefetching || devices.isRefetching;
  const onRefresh = useCallback(async () => {
    await Promise.all([mine.refetch(), asContact.refetch(), devices.refetch()]);
  }, [mine, asContact, devices]);

  const handleWipe = useCallback(() => {
    Alert.alert(
      'Wipe local recovery state?',
      'Simulates losing this device - revokes its device row server-side, then clears its identity keypair, DEK, device id and sync state. Force-quit and relaunch the app afterward to re-register as a fresh device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe',
          style: 'destructive',
          onPress: async () => {
            // Revoke server-side first, while we still know our own device
            // id - otherwise this same physical device re-registers as a
            // brand new row on relaunch, leaving the old one orphaned
            // (two rows for what's actually one phone).
            if (deviceId) await revokeDevice.mutateAsync(deviceId);
            await wipeOwnRecoveryState();
            await reload();
          },
        },
      ],
    );
  }, [deviceId, revokeDevice, reload]);

  if (!snapshot) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const fieldGroup = (
    <FieldGroup
      style={{ backgroundColor: colors.background }}
      modifiers={
        Platform.OS === 'ios'
          ? [
              scrollContentBackground('hidden'),
              background(colors.background),
              tint(colors.foreground),
              refreshable(onRefresh),
            ]
          : undefined
      }
    >
      <FieldGroup.Section title="Identity">
        <InfoRow
          label="Keypair"
          value={snapshot.hasIdentityKeypair ? 'present' : 'missing'}
          theme={theme}
          colors={colors}
        />
        <InfoRow
          label="Public key"
          value={snapshot.publicKeyHex ? `${snapshot.publicKeyHex.slice(0, 16)}…` : '-'}
          copyValue={snapshot.publicKeyHex}
          copyGender="female"
          theme={theme}
          colors={colors}
        />
        <InfoRow
          label="Device id"
          value={deviceId ?? '-'}
          copyValue={deviceId}
          copyGender="male"
          theme={theme}
          colors={colors}
        />
      </FieldGroup.Section>

      <FieldGroup.Section title="DEK / sync state">
        <InfoRow
          label="DEK"
          value={snapshot.hasDek ? 'present' : 'missing'}
          theme={theme}
          colors={colors}
        />
        <InfoRow
          label="Fingerprint"
          value={snapshot.dekFingerprint ?? '-'}
          copyValue={snapshot.dekFingerprint}
          copyGender="female"
          theme={theme}
          colors={colors}
        />
        <InfoRow
          label="Generation"
          value={String(snapshot.syncedState?.generation ?? '-')}
          theme={theme}
          colors={colors}
        />
        <InfoRow
          label="Synced contact ids"
          value={snapshot.syncedState?.contactIds.join(', ') || '-'}
          copyValue={snapshot.syncedState?.contactIds.join(', ')}
          copyGender="male"
          theme={theme}
          colors={colors}
        />
        <InfoRow
          label="Synced own device ids"
          value={snapshot.syncedState?.ownDeviceIds.join(', ') || '-'}
          copyValue={snapshot.syncedState?.ownDeviceIds.join(', ')}
          copyGender="male"
          theme={theme}
          colors={colors}
        />
      </FieldGroup.Section>

      <FieldGroup.Section title={`My devices (${devices.data?.length ?? 0})`}>
        {(devices.data ?? []).map((device) => (
          <InfoRow
            key={device.id}
            label={device.id === deviceId ? `${device.deviceType} (this one)` : device.deviceType}
            value={`dek:${device.encryptedDek ? 'yes' : 'no'}`}
            theme={theme}
            colors={colors}
          />
        ))}
      </FieldGroup.Section>

      {/* No `encryptedShare` here - the owner's own view never exposes it
          (it's sealed to each contact device's key, meaningless to the
          owner); "synced contact ids" / "generation" above already say
          whether the last rotation covered this contact. */}
      <FieldGroup.Section title={`Mine - owner side (${mine.data?.length ?? 0})`}>
        {(mine.data ?? []).map((row) => (
          <InfoRow
            key={row.id}
            label={row.contact?.username ?? row.id}
            value={`${row.status} · devices:${row.contact?.devices.length ?? 0}`}
            theme={theme}
            colors={colors}
          />
        ))}
      </FieldGroup.Section>

      <FieldGroup.Section title={`Trusted by - contact side (${asContactRows?.length ?? 0})`}>
        {(asContactRows ?? []).map((row) => (
          <InfoRow
            key={row.id}
            label={row.owner.username ?? row.id}
            value={`share:${row.encryptedShare ? 'yes' : 'no'} · decrypted:${receivedShares[row.owner.id] ?? 'none'}`}
            theme={theme}
            colors={colors}
          />
        ))}
      </FieldGroup.Section>

      {/* Only way to re-test "I lost every device" repeatedly without a
          full reinstall - see `wipeOwnRecoveryState`'s own doc comment. */}
      <FieldGroup.Section>
        <Row
          spacing={theme.spaces.md}
          alignment="center"
          onPress={handleWipe}
          modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
        >
          <Icon name={Icons.trash} size={theme.icons.sizes.md} color={colors.destructive} />
          <NativeText textStyle={{ color: colors.destructive }}>
            Wipe local recovery state (simulate device loss)
          </NativeText>
        </Row>
      </FieldGroup.Section>
    </FieldGroup>
  );

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
        {Platform.OS === 'android' ? (
          <PullToRefreshBox isRefreshing={refreshing} onRefresh={onRefresh}>
            {fieldGroup}
          </PullToRefreshBox>
        ) : (
          fieldGroup
        )}
      </Host>
    </View>
  );
};

export default RecoveryKeysDebugScreen;
