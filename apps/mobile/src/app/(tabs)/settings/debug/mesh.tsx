import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Host, FieldGroup, Row, Spacer, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { meshTransport } from '../../../../lib/mesh/transport';
import { getSeenCacheSize } from '../../../../lib/mesh/relay';
import { useMeshDebugStore } from '../../../../lib/mesh/debugStore';
import { useMeshSettingsStore } from '../../../../stores/useMeshSettingsStore';
import { usePermissions } from '../../../../providers/PermissionsProvider';
import { useTheme } from '../../../../providers/ThemeProvider';
import { View } from '../../../../components/ui/view';

const STATUS_POLL_MS = 2000;

const InfoRow = ({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) => (
  <Row
    spacing={8}
    alignment="center"
    modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
  >
    <NativeText textStyle={{ color: colors.foreground }}>{label}</NativeText>
    <Spacer flexible />
    <NativeText textStyle={{ color: colors.mutedForeground, textAlign: 'right' }}>
      {value}
    </NativeText>
  </Row>
);

/**
 * `__DEV__`-only inspector for `lib/mesh` (see `settings/debug/index.tsx`)
 * - scalar counters only, no `LegendList`/unbounded list, so this is
 * safely a plain `FieldGroup.Section` (see `settings/debug/sync/index.tsx`'s
 * own doc comment on why that distinction matters). Needs 2+ physical
 * devices to see anything move - BLE central+peripheral doesn't work in
 * a simulator.
 */
const MeshDebugScreen = () => {
  const { colors, mode } = useTheme();
  const meshRelayEnabled = useMeshSettingsStore((state) => state.meshRelayEnabled);
  const bluetoothPermission = usePermissions().bluetooth;
  const { sentCount, relayedCount, receivedCount, peerCount } = useMeshDebugStore();
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean | null>(null);
  const [seenCacheSize, setSeenCacheSize] = useState(0);

  const refreshStatus = useCallback(async () => {
    setBluetoothEnabled(await meshTransport.isAvailable());
    setSeenCacheSize(getSeenCacheSize());
  }, []);

  useEffect(() => {
    // Fetch-on-mount/poll; `refreshStatus` sets state after awaiting, same
    // justification as `recovery-keys.tsx`'s `reload`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshStatus();
    const interval = setInterval(refreshStatus, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshStatus]);

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
          <FieldGroup.Section title="Status">
            <InfoRow
              label="Relay enabled (Settings)"
              value={meshRelayEnabled ? 'yes' : 'no'}
              colors={colors}
            />
            <InfoRow
              label="Bluetooth"
              value={bluetoothEnabled === null ? '…' : bluetoothEnabled ? 'on' : 'off'}
              colors={colors}
            />
            <InfoRow
              label="Bluetooth permission"
              value={bluetoothPermission.status}
              colors={colors}
            />
            <InfoRow label="Nearby peers" value={String(peerCount)} colors={colors} />
          </FieldGroup.Section>

          <FieldGroup.Section title="Traffic">
            <InfoRow label="Sent" value={String(sentCount)} colors={colors} />
            <InfoRow label="Relayed" value={String(relayedCount)} colors={colors} />
            <InfoRow label="Received" value={String(receivedCount)} colors={colors} />
            <InfoRow label="Dedup cache size" value={String(seenCacheSize)} colors={colors} />
          </FieldGroup.Section>

          {!meshRelayEnabled && (
            <FieldGroup.Section>
              <Row
                spacing={8}
                alignment="center"
                modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
              >
                <NativeText textStyle={{ color: colors.mutedForeground }}>
                  Mesh relay is off - enable it in Settings to see traffic here.
                </NativeText>
              </Row>
            </FieldGroup.Section>
          )}
        </FieldGroup>
      </Host>
    </View>
  );
};

export default MeshDebugScreen;
