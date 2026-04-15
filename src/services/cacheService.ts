import { Reading } from '../types/reading';
import { CACHE_TTL_MS } from '../utils/constants';

const cache = new Map<string, Reading[]>();

export function addReading(reading: Reading): void {
  const existing = cache.get(reading.deviceId) ?? [];
  const now = Date.now();
  const fresh = existing.filter(r => now - r.timestamp < CACHE_TTL_MS);
  cache.set(reading.deviceId, [reading, ...fresh]);
}

export function getReadings(deviceId: string): Reading[] {
  const now = Date.now();
  const readings = cache.get(deviceId) ?? [];
  return readings.filter(r => now - r.timestamp < CACHE_TTL_MS);
}

export function getAllCachedReadings(): Reading[] {
  return Array.from(cache.values()).flat();
}

export function clearCache(): void {
  cache.clear();
}
