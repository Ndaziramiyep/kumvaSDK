import { setSecretKey as bleSetSecretKey } from './bluetoothService';
import { getReadyDb } from '../database/db';

let _secretKey = '';

/** Apply the in-memory key to the BLE manager. */
export function applySecretKey(): void {
  if (_secretKey) bleSetSecretKey(_secretKey);
}

/** Return the current in-memory key. */
export function getSecretKey(): string {
  return _secretKey;
}

/**
 * Save the key in memory, push it to the BLE manager, and persist it
 * against every device in the DB (all devices share the same key).
 */
export async function saveSecretKey(key: string): Promise<void> {
  _secretKey = key.trim();
  bleSetSecretKey(_secretKey);
  try {
    const db = await getReadyDb();
    await db.runAsync('UPDATE devices SET secret_key = ?', _secretKey);
  } catch (e) {
    console.error('[SecretKey] failed to persist key', e);
  }
}

/**
 * Called once on app startup — reads the key from any device row and
 * restores it into memory + BLE manager so syncs work immediately.
 */
export async function restoreSecretKey(): Promise<void> {
  try {
    const db = await getReadyDb();
    const rows = await db.getAllAsync<{ secret_key: string | null }>(
      'SELECT secret_key FROM devices WHERE secret_key IS NOT NULL LIMIT 1'
    );
    const key = rows[0]?.secret_key ?? '';
    if (key) {
      _secretKey = key;
      bleSetSecretKey(_secretKey);
    }
  } catch (e) {
    console.error('[SecretKey] failed to restore key', e);
  }
}
