import { getReadyDb } from '../db';
import { Incident } from '../../types/incident';

export async function getAllIncidents(): Promise<Incident[]> {
  const db = await getReadyDb();
  if (!db) return [];
  return db.getAllAsync<Incident>('SELECT * FROM incidents ORDER BY start_time DESC');
}

export async function getIncidentsByDevice(device_id: string): Promise<Incident[]> {
  const db = await getReadyDb();
  if (!db) return [];
  return db.getAllAsync<Incident>(
    'SELECT * FROM incidents WHERE device_id = ? ORDER BY start_time DESC',
    device_id
  );
}

export async function insertIncident(incident: Omit<Incident, 'incident_id'>): Promise<void> {
  const db = await getReadyDb();
  if (!db) return;
  await db.runAsync(
    'INSERT INTO incidents (device_id, device_name, device_category, start_time, end_time, max_temperature, min_temperature) VALUES (?, ?, ?, ?, ?, ?, ?)',
    incident.device_id,
    incident.device_name ?? '',
    incident.device_category ?? '',
    incident.start_time,
    incident.end_time ?? null,
    incident.max_temperature,
    incident.min_temperature ?? null
  );
}

export async function closeIncident(incident_id: number, end_time: number): Promise<void> {
  const db = await getReadyDb();
  if (!db) return;
  await db.runAsync(
    'UPDATE incidents SET end_time = ? WHERE incident_id = ?',
    end_time, incident_id
  );
}

export async function getOpenIncidentForDevice(device_id: string): Promise<Incident | null> {
  const db = await getReadyDb();
  if (!db) return null;
  const rows = await db.getAllAsync<Incident>(
    'SELECT * FROM incidents WHERE device_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
    device_id
  );
  return rows[0] ?? null;
}

export async function countIncidentsByDevice(device_id: string): Promise<number> {
  const db = await getReadyDb();
  if (!db) return 0;
  const rows = await db.getAllAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM incidents WHERE device_id = ?',
    device_id
  );
  return rows[0]?.cnt ?? 0;
}
