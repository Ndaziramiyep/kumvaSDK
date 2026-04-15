import { getReadyDb } from '../db';
import { Reminder } from '../../types/reminder';

export async function getAllReminders(): Promise<Reminder[]> {
  const db = await getReadyDb();
  if (!db) return [];
  const rows = await db.getAllAsync<any>('SELECT * FROM reminders ORDER BY reminder_id DESC');
  return rows.map(r => ({ ...r, is_active: r.is_active === 1 }));
}

export async function insertReminder(reminder: Omit<Reminder, 'reminder_id'>): Promise<void> {
  const db = await getReadyDb();
  if (!db) return;
  await db.runAsync(
    'INSERT INTO reminders (frequency, last_sent, is_active) VALUES (?, ?, ?)',
    reminder.frequency, reminder.last_sent ?? null, reminder.is_active ? 1 : 0
  );
}

export async function setReminderActive(reminder_id: number, is_active: boolean): Promise<void> {
  const db = await getReadyDb();
  if (!db) return;
  await db.runAsync(
    'UPDATE reminders SET is_active = ? WHERE reminder_id = ?',
    is_active ? 1 : 0, reminder_id
  );
}
