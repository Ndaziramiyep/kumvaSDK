import { getReadyDb } from '../db';
import { Device } from '../../types/device';

export async function getAllDevices(): Promise<Device[]> {
  const db = await getReadyDb();
  return db.getAllAsync<Device>('SELECT * FROM devices ORDER BY created_at DESC');
}

export async function insertDevice(device: Device): Promise<void> {
  const db = await getReadyDb();
  const { device_id, name, category, mac_address, temp_low_threshold, temp_high_threshold, battery_level, last_sync, secret_key, created_at } = device;
  await db.runAsync(
    `INSERT INTO devices
      (device_id, name, category, mac_address, temp_low_threshold, temp_high_threshold, battery_level, last_sync, secret_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    device_id, name, category, mac_address,
    temp_low_threshold, temp_high_threshold,
    battery_level ?? null, last_sync ?? null, secret_key ?? null, created_at
  );
}

export async function deleteDevice(device_id: string): Promise<void> {
  const db = await getReadyDb();
  await db.runAsync('DELETE FROM devices WHERE device_id = ?', device_id);
}

export async function updateDevice(device: Device): Promise<void> {
  const db = await getReadyDb();
  await db.runAsync(
    'UPDATE devices SET name = ?, category = ?, temp_low_threshold = ?, temp_high_threshold = ?, secret_key = ? WHERE device_id = ?',
    device.name, device.category, device.temp_low_threshold, device.temp_high_threshold, device.secret_key ?? null, device.device_id
  );
}

export async function updateDeviceSync(device_id: string, last_sync: number, battery_level?: number): Promise<void> {
  const db = await getReadyDb();
  await db.runAsync(
    'UPDATE devices SET last_sync = ?, battery_level = ? WHERE device_id = ?',
    last_sync, battery_level ?? null, device_id
  );
}
