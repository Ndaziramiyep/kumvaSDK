import { getAllDevices, updateDeviceSync } from '../database/repositories/deviceRepository';
import { insertReadings } from '../database/repositories/readingRepository';
import { insertIncident, closeIncident, getOpenIncidentForDevice } from '../database/repositories/incidentRepository';
import { connect, disConnect, readThHistoryData, onThHistoryData, onConnState } from './bluetoothService';
import { applySecretKey } from './secretKeyService';
import { setSecretKey } from './bluetoothService';
import { sendThresholdAlert, sendSyncNotification } from './notificationService';
import { useAppStore } from '../store/store';
import { Reading } from '../types/reading';

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

async function syncDevice(device: { device_id: string; mac_address: string; battery_level?: number | null; temp_low_threshold: number; temp_high_threshold: number; secret_key?: string | null }): Promise<void> {
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

    // Step 1: connect with 20s timeout
    // Apply this device's own secret key before connecting
    if (device.secret_key) setSecretKey(device.secret_key);
    else applySecretKey();
    connTimer = setTimeout(() => {
      cleanup();
      disConnect(device.mac_address);
      resolve();
    }, 20_000);

    connSub = onConnState(async (event: any) => {
      const mac = (event?.mac ?? '').toUpperCase();
      if (mac !== device.mac_address.toUpperCase()) return;

      if (event.state === 'connected_complete') {
        clearTimeout(connTimer);
        connSub?.remove?.();

        // Step 2: read history with 30s timeout — resolve empty on timeout
        histTimer = setTimeout(() => {
          cleanup();
          disConnect(device.mac_address);
          resolve();
        }, 30_000);

        histSub = onThHistoryData(async (event: any) => {
          clearTimeout(histTimer);
          histSub?.remove?.();

          try {
            const payload = Array.isArray(event) ? { history: event } : event;
            const items: any[] = Array.isArray(payload.history) ? payload.history : [];

            const parseTs = (ts: any): number => {
              if (typeof ts === 'number' && ts > 1_000_000_000) return ts < 1e12 ? ts * 1000 : ts;
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
              await insertReadings(readings);

              // ── Incident detection ──────────────────────────────────────
              // Sort ascending so we process chronologically
              const sorted = [...readings].sort((a, b) => a.timestamp - b.timestamp);
              let openIncident = await getOpenIncidentForDevice(device.device_id);

              for (const r of sorted) {
                const breaching = r.temperature > device.temp_high_threshold ||
                                  r.temperature < device.temp_low_threshold;
                if (breaching) {
                  if (!openIncident) {
                    // Open a new incident
                    await insertIncident({
                      device_id: device.device_id,
                      device_name: (device as any).name ?? '',
                      device_category: (device as any).category ?? '',
                      start_time: r.timestamp,
                      end_time: null,
                      max_temperature: r.temperature,
                      min_temperature: r.temperature,
                    });
                    openIncident = await getOpenIncidentForDevice(device.device_id);
                    // Fire real push notification for the breach
                    sendThresholdAlert(
                      (device as any).name ?? device.device_id,
                      device.device_id,
                      r.temperature,
                      device.temp_high_threshold,
                      device.temp_low_threshold,
                    ).catch(console.error);
                  } else {
                    // Update max/min temperature if needed
                    const newMax = r.temperature > openIncident.max_temperature ? r.temperature : openIncident.max_temperature;
                    const newMin = openIncident.min_temperature == null || r.temperature < openIncident.min_temperature ? r.temperature : openIncident.min_temperature;
                    if (newMax !== openIncident.max_temperature || newMin !== openIncident.min_temperature) {
                      const db = await import('../database/db').then(m => m.getReadyDb());
                      await db.runAsync(
                        'UPDATE incidents SET max_temperature = ?, min_temperature = ? WHERE incident_id = ?',
                        newMax, newMin, openIncident.incident_id
                      );
                      openIncident = { ...openIncident, max_temperature: newMax, min_temperature: newMin };
                    }
                  }
                } else if (openIncident) {
                  // Temperature back in range — close the incident
                  await closeIncident(openIncident.incident_id as number, r.timestamp);
                  openIncident = null;
                }
              }
            }

            const syncTime = Date.now();
            await updateDeviceSync(device.device_id, syncTime, device.battery_level ?? undefined);

            // Update Zustand store
            const store = useAppStore.getState();
            const existing = store.devices.find(d => d.device_id === device.device_id);
            if (existing) {
              store.updateDevice({ ...existing, last_sync: syncTime });
            }

            // Notify sync complete
            sendSyncNotification(
              (device as any).name ?? device.device_id,
              device.device_id,
              readings.length,
            ).catch(console.error);
          } catch (e) {
            console.error('[AutoSync] persist error', e);
          }

          disConnect(device.mac_address);
          resolve();
        });

        readThHistoryData(device.mac_address);

      } else if (event.state === 'password_error' || event.state === 'disconnected') {
        cleanup();
        resolve();
      }
    });

    connect(device.mac_address);
  });
}

async function runAutoSync(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const devices = await getAllDevices();
    // Sync devices sequentially to avoid BLE conflicts
    for (const device of devices) {
      await syncDevice(device);
      // Small gap between devices
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    console.error('[AutoSync] error', e);
  } finally {
    syncing = false;
  }
}

export function startAutoSync(): void {
  if (syncTimer) return;
  // Run once after 30s on startup, then every 10 minutes
  setTimeout(() => runAutoSync(), 30_000);
  syncTimer = setInterval(() => runAutoSync(), SYNC_INTERVAL_MS);
}

export function stopAutoSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export async function syncSingleDevice(
  device: { device_id: string; mac_address: string; battery_level?: number | null; temp_low_threshold: number; temp_high_threshold: number; secret_key?: string | null }
): Promise<void> {
  await syncDevice(device);
}
