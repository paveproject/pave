import {
  addEventListener,
  connect,
  discoverServices,
  disconnect,
  isBluetoothEnabled,
  respondToPeripheralWriteRequest,
  setServices,
  startAdvertising,
  startScan,
  stopAdvertising,
  stopScan,
  subscribeToCharacteristic,
  updateCharacteristicValue,
  writeCharacteristic,
  type BLEDevice,
} from 'munim-bluetooth';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { logger } from '../../logger';

/** This app's own mesh GATT service - one service, one characteristic,
 * carrying nothing but encoded `MeshPacket`s (see `packet.ts`). Fixed
 * constants, not configurable - every device must agree on them to find
 * each other at all. */
const MESH_SERVICE_UUID = '7a2b9e40-9c3d-4f6a-8e2b-1a5c3d7f9b10';
const MESH_CHARACTERISTIC_UUID = '7a2b9e41-9c3d-4f6a-8e2b-1a5c3d7f9b10';

export interface MeshTransport {
  /** Bluetooth powered on - does not by itself imply permission has been
   * granted (see `usePermissions().bluetooth`). */
  isAvailable(): Promise<boolean>;
  /** Starts both BLE roles (advertise as peripheral, scan as central)
   * and wires every event this module cares about. Idempotent - calling
   * it again while already started is a no-op. */
  start(): Promise<void>;
  /** Tears down both roles, disconnects every peer, removes every
   * listener. Safe to call even if never started. */
  stop(): Promise<void>;
  /** Fans out to every currently-visible peer: a peripheral-side notify
   * to every subscribed central, plus a central-side write to every
   * device this device is itself connected to. Best-effort per peer - one
   * failed delivery never blocks the others. */
  send(packet: Uint8Array): Promise<void>;
  onReceive(handler: (packet: Uint8Array) => void): () => void;
  onPeerCountChange(handler: (count: number) => void): () => void;
}

/** `setServices()` has no completion signal - it's a fire-and-forget
 * native call, but registering the GATT characteristic with the
 * platform's peripheral manager (e.g. `CBPeripheralManager.add(service:)`
 * on iOS) is itself asynchronous. Without this, a `send()` racing right
 * behind `start()` - exactly what happens at launch, broadcasting every
 * pre-existing unsynced local report - fails with "Local characteristic
 * not found". Conservative, not measured: there's no event to wait on
 * instead. */
const CHARACTERISTIC_REGISTRATION_DELAY_MS = 500;

class MunimMeshTransport implements MeshTransport {
  private started = false;
  private readonly connectedCentralIds = new Set<string>();
  private readonly subscribedCentralIds = new Set<string>();
  private readonly receiveHandlers = new Set<(packet: Uint8Array) => void>();
  private readonly peerCountHandlers = new Set<(count: number) => void>();
  private unsubscribers: (() => void)[] = [];
  private readyPromise: Promise<void> = Promise.resolve();

  async isAvailable(): Promise<boolean> {
    try {
      return await isBluetoothEnabled();
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    setServices(
      [
        {
          uuid: MESH_SERVICE_UUID,
          characteristics: [
            {
              uuid: MESH_CHARACTERISTIC_UUID,
              // `write`/`writeWithoutResponse` so other devices (as
              // central) can push a packet to us; `notify` so we (as
              // peripheral) can push one to every subscribed central.
              properties: ['write', 'writeWithoutResponse', 'notify'],
            },
          ],
        },
      ],
      { mode: 'automatic' },
    );
    this.readyPromise = new Promise((resolve) =>
      setTimeout(resolve, CHARACTERISTIC_REGISTRATION_DELAY_MS),
    );

    this.unsubscribers = [
      addEventListener('deviceFound', (device) => this.handleDeviceFound(device)),
      addEventListener('peripheralWriteRequest', (request) => {
        const packet = this.tryDecodeHex(request.value);
        if (packet) this.emitReceived(packet);
        if (request.responseRequired) {
          respondToPeripheralWriteRequest(request.requestId, true, 'success').catch((error) =>
            logger.error('mesh: failed to ack peripheral write', { error }),
          );
        }
      }),
      addEventListener('characteristicValueChanged', (value) => {
        if (value.characteristicUUID !== MESH_CHARACTERISTIC_UUID) return;
        const packet = this.tryDecodeHex(value.value);
        if (packet) this.emitReceived(packet);
      }),
      addEventListener('peripheralSubscribed', (event) => {
        this.subscribedCentralIds.add(event.centralId);
        this.emitPeerCount();
      }),
      addEventListener('peripheralUnsubscribed', (event) => {
        this.subscribedCentralIds.delete(event.centralId);
        this.emitPeerCount();
      }),
      addEventListener('deviceDisconnected', (event) => {
        this.connectedCentralIds.delete(event.deviceId);
        this.emitPeerCount();
      }),
    ];

    startAdvertising({ serviceUUIDs: [MESH_SERVICE_UUID] });
    startScan({ serviceUUIDs: [MESH_SERVICE_UUID] });
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    stopScan();
    stopAdvertising();
    for (const deviceId of this.connectedCentralIds) {
      disconnect(deviceId);
    }
    this.connectedCentralIds.clear();
    this.subscribedCentralIds.clear();
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  async send(packet: Uint8Array): Promise<void> {
    await this.readyPromise;
    const hex = bytesToHex(packet);

    await updateCharacteristicValue(MESH_SERVICE_UUID, MESH_CHARACTERISTIC_UUID, hex, true).catch(
      (error) => logger.error('mesh: failed to notify subscribed centrals', { error }),
    );

    await Promise.all(
      Array.from(this.connectedCentralIds).map((deviceId) =>
        writeCharacteristic(
          deviceId,
          MESH_SERVICE_UUID,
          MESH_CHARACTERISTIC_UUID,
          hex,
          'writeWithoutResponse',
        ).catch((error) => logger.error('mesh: failed to write to peer', { deviceId, error })),
      ),
    );
  }

  onReceive(handler: (packet: Uint8Array) => void): () => void {
    this.receiveHandlers.add(handler);
    return () => this.receiveHandlers.delete(handler);
  }

  onPeerCountChange(handler: (count: number) => void): () => void {
    this.peerCountHandlers.add(handler);
    return () => this.peerCountHandlers.delete(handler);
  }

  private async handleDeviceFound(device: BLEDevice): Promise<void> {
    if (this.connectedCentralIds.has(device.id)) return;

    try {
      await connect(device.id, { timeoutMs: 15_000 });
      await discoverServices(device.id);
      await subscribeToCharacteristic(device.id, MESH_SERVICE_UUID, MESH_CHARACTERISTIC_UUID);
      this.connectedCentralIds.add(device.id);
      this.emitPeerCount();
    } catch (error) {
      // A peer out of range mid-connect, or one that dropped before
      // service discovery finished - not worth surfacing, the next scan
      // result retries naturally.
      logger.error('mesh: failed to connect to discovered peer', {
        deviceId: device.id,
        error,
      });
    }
  }

  private tryDecodeHex(hex: string): Uint8Array | null {
    try {
      return hexToBytes(hex);
    } catch {
      return null;
    }
  }

  private emitReceived(packet: Uint8Array): void {
    this.receiveHandlers.forEach((handler) => handler(packet));
  }

  private emitPeerCount(): void {
    const count = new Set([...this.connectedCentralIds, ...this.subscribedCentralIds]).size;
    this.peerCountHandlers.forEach((handler) => handler(count));
  }
}

export const meshTransport: MeshTransport = new MunimMeshTransport();
