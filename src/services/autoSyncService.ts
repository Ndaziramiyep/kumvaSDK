import { getAllDevices, updateDeviceSync } from '../database/repositories/deviceRepository';
import { insertReadings, getLastReadingTimestamp } from '../database/repositories/readingRepository';
import { processReading } from './thresholdService';
import { startScan, stopScan, connect, disConnect, readThHistoryData, onScanResult, onThHistoryData, onConnState, setSecretKey } from './bluetoothService';
import { applySecretKey } from './secretKeyService';
import { useAppStore } from '../store/store';
import { Reading } from '../types/reading';
import { Device } from '../types/device';
import { SYNC_INTERVAL_MS } from '../utils/constants';

let scanSub: any = null;
const syncQueue: Device[] = [];
const queuedDeviceIds = new Set<string>();
let isProcessingQueue = false;

// ── Sync a single device ──────────────────────────────────────────────────────
async function syncDevice(device: Device): Promise<void> {
  return new Promise<void>((resolve) => {
    let connSub: any;
    let histSub: any;
    let connTimer: any;
    let histTimer: any;

    const cleanup = () => {
      clearTimeout(connTimer);
      clearTimeout(histTimer);
      connSub?.remove?.();
      histSub?.remove?.();
    };

    const fail = () => { cleanup(); disConnect(device.mac_address); resolve(); };

    // Step: authenticate — apply device secret key before connecting
    if (device.secret_key) setSecretKey(device.secret_key);
    else applySecretKey();

    // Step: connect with 20s timeout
    connTimer = setTimeout(fail, 20_000);

    connSub = onConnState(async (event: any) => {
      const mac = (event?.mac ?? '').toUpperCase();
      if (mac !== device.mac_address.toUpperCase()) return;

      if (event.state === 'connected_complete') {
        clearTimeout(connTimer);
        connSub?.remove?.();

        // Step: get last stored timestamp → fetch only new data
        const fromTimestamp = await getLastReadingTimestamp(device.device_id);

        histTimer = setTimeout(fail, 30_000);

        histSub = onThHistoryData(async (event: any) => {
          clearTimeout(histTimer);
          histSub?.remove?.();

          try {
            const items: any[] = Array.isArray(event?.history) ? event.history
              : Array.isArray(event) ? event : [];

            const parseTs = (ts: any): number => {
              if (typeof ts === 'number' && ts > 1_000_000_000)
                return ts < 1e12 ? ts * 1000 : ts;
              if (typeof ts === 'string') {
                const p = Date.parse(ts.replace(' ', 'T'));
                if (!isNaN(p)) return p;
              }
              return Date.now();
            };

            const readings: Omit<Reading, 'reading_id'>[] = items
              .filter(i => i != null && i.temperature != null)
              .map(i => ({
                device_id: device.device_id,
                temperature: Number(i.temperature),
                humidity: i.humidity != null ? Number(i.humidity) : null,
                timestamp: parseTs(i.timestamp),
              }));

            if (readings.length > 0) {
              // Store new data
              await insertReadings(readings);
              // Start processing — Incident Engine loops through each record
              for (const r of readings) {
                await processReading(device, r as Reading);
              }
            }

            // Step: update last sync time
            const syncTime = Date.now();
            await updateDeviceSync(device.device_id, syncTime, device.battery_level ?? undefined);

            const store = useAppStore.getState();
            const existing = store.devices.find(d => d.device_id === device.device_id);
            if (existing) store.updateDevice({ ...existing, last_sync: syncTime });
            store.setLastSyncedAt(syncTime);

          } catch (e) {
            console.error('[AutoSync] persist error', e);
          }

          // Step: disconnect
          disConnect(device.mac_address);
          resolve();
        });

        // Step: request data from last saved timestamp until now
        readThHistoryData(device.mac_address, fromTimestamp);

      } else if (event.state === 'password_error' || event.state === 'disconnected') {
        cleanup();
        resolve();
      }
    });

    // Step: connect to device
    connect(device.mac_address);
  });
}

// ── Queue processor: one device at a time ────────────────────────────────────
async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  while (syncQueue.length > 0) {
    const device = syncQueue.shift()!;
    await syncDevice(device);
    queuedDeviceIds.delete(device.device_id);
  }
  isProcessingQueue = false;
}

// ── Scan listener: device detected → enqueue if sync needed ──────────────────
async function onDeviceDetected(scannedDevices: any[]): Promise<void> {
  const registeredDevices = await getAllDevices();
  const registeredMap = new Map(registeredDevices.map(d => [d.mac_address.toUpperCase(), d]));

  for (const scanned of scannedDevices) {
    const mac = (scanned?.mac ?? scanned?.macAddress ?? '').toUpperCase();
    const device = registeredMap.get(mac);
    if (!device) continue;                              // not a registered device
    if (queuedDeviceIds.has(device.device_id)) continue; // already in queue or syncing

    // Check last sync — skip if less than 10 minutes ago
    const lastSync = device.last_sync ?? 0;
    if (Date.now() - lastSync < SYNC_INTERVAL_MS) continue;

    syncQueue.push(device);
    queuedDeviceIds.add(device.device_id);
  }

  processQueue();
}

// ── Public API ────────────────────────────────────────────────────────────────
export function startAutoSync(): void {
  if (scanSub) return;
  startScan();
  scanSub = onScanResult(onDeviceDetected);
}

export function stopAutoSync(): void {
  scanSub?.remove?.();
  scanSub = null;
  stopScan();
}

export async function syncSingleDevice(device: Device): Promise<void> {
  if (queuedDeviceIds.has(device.device_id)) return;
  syncQueue.push(device);
  queuedDeviceIds.add(device.device_id);
  processQueue();
}
