import { getReadyDb } from '../db';
import { Reading } from '../../types/reading';

export async function getReadingsByDevice(device_id: string, limit = 100): Promise<Reading[]> {
  const db = await getReadyDb();
  if (!db) return [];
  return db.getAllAsync<Reading>(
    'SELECT * FROM readings WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?',
    device_id, limit
  );
}

export async function getReadingsLast7Days(device_id: string): Promise<Reading[]> {
  const db = await getReadyDb();
  if (!db) return [];
  const cutoff = Date.now() - 7 * 86400000;
  return db.getAllAsync<Reading>(
    'SELECT * FROM readings WHERE device_id = ? AND timestamp >= ? ORDER BY timestamp ASC',
    device_id, cutoff
  );
}

export async function getReadingsByDateRange(
  device_id: string, startTs: number, endTs: number
): Promise<Reading[]> {
  const db = await getReadyDb();
  if (!db) return [];
  return db.getAllAsync<Reading>(
    'SELECT * FROM readings WHERE device_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC',
    device_id, startTs, endTs
  );
}

  const db = await getReadyDb();
  if (!db) return;
  await db.runAsync(
    'INSERT INTO readings (device_id, temperature, humidity, timestamp) VALUES (?, ?, ?, ?)',
    reading.device_id, reading.temperature, reading.humidity ?? null, reading.timestamp
  );
}

export async function insertReadings(readings: Omit<Reading, 'reading_id'>[]): Promise<void> {
  const db = await getReadyDb();
  if (!db) return;
  for (const r of readings) {
    await db.runAsync(
      'INSERT INTO readings (device_id, temperature, humidity, timestamp) VALUES (?, ?, ?, ?)',
      r.device_id, r.temperature, r.humidity ?? null, r.timestamp
    );
  }
}
