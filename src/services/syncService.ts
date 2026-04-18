import { SYNC_INTERVAL_MS } from '../utils/constants';
import { getAllCachedReadings, clearCache } from './cacheService';
import { insertReadings } from '../database/repositories/readingRepository';
import { getAllDevices } from '../database/repositories/deviceRepository';
import { processReading } from './thresholdService';

let syncTimer: ReturnType<typeof setInterval> | null = null;

export function startSync(): void {
  if (syncTimer) return;
  syncTimer = setInterval(async () => {
    const readings = getAllCachedReadings();
    if (readings.length > 0) {
      await insertReadings(readings);
      // Check thresholds
      const devices = await getAllDevices();
      const deviceMap = new Map(devices.map(d => [d.device_id, d]));
      for (const reading of readings) {
        const device = deviceMap.get(reading.device_id);
        if (device) {
          await processReading(device, reading);
        }
      }
      clearCache();
    }
  }, SYNC_INTERVAL_MS);
}

export function stopSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
