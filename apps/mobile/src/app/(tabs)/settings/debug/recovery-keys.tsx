import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { trustedByOptions, trustedContactsOptions } from '@libs/query-client';
import {
  getDebugSnapshot,
  getReceivedShareDebugInfo,
  type RecoveryKeyDebugSnapshot,
} from '../../../../lib/recoveryKey';
import { Text } from '../../../../components/ui/text';
import { View } from '../../../../components/ui/view';
import { useTheme } from '../../../../providers/ThemeProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
    <Text textColor="muted">{label}</Text>
    <Text style={{ flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const { theme, colors } = useTheme();
  return (
    <View
      style={{
        gap: theme.spaces.sm,
        padding: theme.spaces.md,
        borderRadius: theme.border.radius.md,
        backgroundColor: colors.muted,
      }}
    >
      <Text style={{ fontWeight: '700' }}>{title}</Text>
      <View style={{ gap: theme.spaces.xs }}>{children}</View>
    </View>
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
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<RecoveryKeyDebugSnapshot | null>(null);
  const [receivedShares, setReceivedShares] = useState<Record<string, string>>({});

  const mine = useQuery(trustedContactsOptions());
  const asContact = useQuery(trustedByOptions());
  const asContactRows = asContact.data;

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

  const refreshing = mine.isRefetching || asContact.isRefetching;
  const onRefresh = useCallback(() => {
    mine.refetch();
    asContact.refetch();
  }, [mine, asContact]);

  if (!snapshot) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        paddingLeft: insets.left + theme.spaces.horizontal,
        paddingRight: insets.right + theme.spaces.horizontal,
        paddingBottom: insets.bottom + theme.spaces.vertical,
        gap: theme.spaces.md,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Section title="Identity">
        <InfoRow label="Keypair" value={snapshot.hasIdentityKeypair ? 'present' : 'missing'} />
        <InfoRow
          label="Public key"
          value={snapshot.publicKeyHex ? `${snapshot.publicKeyHex.slice(0, 16)}…` : '-'}
        />
      </Section>

      <Section title="DEK / sync state">
        <InfoRow label="DEK" value={snapshot.hasDek ? 'present' : 'missing'} />
        <InfoRow label="Fingerprint" value={snapshot.dekFingerprint ?? '-'} />
        <InfoRow label="Generation" value={String(snapshot.syncedState?.generation ?? '-')} />
        <InfoRow
          label="Synced contact ids"
          value={snapshot.syncedState?.contactIds.join(', ') || '-'}
        />
      </Section>

      {/* No `encryptedShare` here - the owner's own view never exposes it
          (it's sealed to each contact's key, meaningless to the owner);
          "synced contact ids" / "generation" above already say whether
          the last rotation covered this contact. */}
      <Section title={`Mine - owner side (${mine.data?.length ?? 0})`}>
        {(mine.data ?? []).map((row) => (
          <InfoRow
            key={row.id}
            label={row.contact?.username ?? row.id}
            value={`${row.status} · pk:${row.contact?.publicKey ? 'yes' : 'no'}`}
          />
        ))}
      </Section>

      <Section title={`Trusted by - contact side (${asContactRows?.length ?? 0})`}>
        {(asContactRows ?? []).map((row) => (
          <InfoRow
            key={row.id}
            label={row.owner.username ?? row.id}
            value={`share:${row.encryptedShare ? 'yes' : 'no'} · decrypted:${receivedShares[row.owner.id] ?? 'none'}`}
          />
        ))}
      </Section>
    </ScrollView>
  );
};

export default RecoveryKeysDebugScreen;
