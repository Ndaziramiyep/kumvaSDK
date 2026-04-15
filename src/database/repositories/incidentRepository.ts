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
    'INSERT INTO incidents (device_id, start_time, end_time, max_temperature) VALUES (?, ?, ?, ?)',
    incident.device_id, incident.start_time, incident.end_time ?? null, incident.max_temperature
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
