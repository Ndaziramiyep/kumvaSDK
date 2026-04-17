import * as ExpoNotifications from 'expo-notifications';
import { getReadyDb } from '../database/db';

// ── Configure how notifications appear when app is foregrounded ───────────────
ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

// ── Types ─────────────────────────────────────────────────────────────────────
export type NotifType = 'incident' | 'sync' | 'weekly' | 'monthly' | 'info';

export interface AppNotification {
  notif_id:  number;
  type:      NotifType;
  title:     string;
  body:      string;
  device_id: string | null;
  timestamp: number;
  is_read:   number; // 0 | 1
}

// ── Permissions ───────────────────────────────────────────────────────────────
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await ExpoNotifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Send + persist ────────────────────────────────────────────────────────────
export async function sendNotification(
  type: NotifType,
  title: string,
  body: string,
  deviceId?: string,
): Promise<void> {
  // Fire the OS push notification immediately
  await ExpoNotifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });

  // Persist to DB so the in-app screen can show it
  try {
    const db = await getReadyDb();
    await db.runAsync(
      'INSERT INTO notifications (type, title, body, device_id, timestamp, is_read) VALUES (?, ?, ?, ?, ?, 0)',
      type, title, body, deviceId ?? null, Date.now(),
    );
  } catch (e) {
    console.error('[Notifications] persist error', e);
  }
}

// ── Threshold breach alert ────────────────────────────────────────────────────
export async function sendThresholdAlert(
  deviceName: string,
  deviceId: string,
  temperature: number,
  highThreshold: number,
  lowThreshold: number,
): Promise<void> {
  const direction = temperature > highThreshold ? 'above' : 'below';
  const threshold = temperature > highThreshold ? highThreshold : lowThreshold;
  await sendNotification(
    'incident',
    `⚠️ Temperature Alert — ${deviceName}`,
    `Temperature ${temperature.toFixed(1)}°C is ${direction} the ${direction === 'above' ? 'high' : 'low'} threshold of ${threshold}°C.`,
    deviceId,
  );
}

// ── Sync complete notification ────────────────────────────────────────────────
export async function sendSyncNotification(
  deviceName: string,
  deviceId: string,
  readingCount: number,
): Promise<void> {
  await sendNotification(
    'sync',
    `✅ Sync Complete — ${deviceName}`,
    readingCount > 0
      ? `${readingCount} new reading${readingCount !== 1 ? 's' : ''} saved.`
      : 'No new readings from device.',
    deviceId,
  );
}

// ── DB queries ────────────────────────────────────────────────────────────────
export async function getAllNotifications(): Promise<AppNotification[]> {
  const db = await getReadyDb();
  return db.getAllAsync<AppNotification>(
    'SELECT * FROM notifications ORDER BY timestamp DESC',
  );
}

export async function getUnreadCount(): Promise<number> {
  const db = await getReadyDb();
  const rows = await db.getAllAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0',
  );
  return rows[0]?.cnt ?? 0;
}

export async function markAllRead(): Promise<void> {
  const db = await getReadyDb();
  await db.runAsync('UPDATE notifications SET is_read = 1');
}

export async function markNotificationRead(notif_id: number): Promise<void> {
  const db = await getReadyDb();
  await db.runAsync('UPDATE notifications SET is_read = 1 WHERE notif_id = ?', notif_id);
}

export async function deleteNotification(notif_id: number): Promise<void> {
  const db = await getReadyDb();
  await db.runAsync('DELETE FROM notifications WHERE notif_id = ?', notif_id);
}

export async function clearAllNotifications(): Promise<void> {
  const db = await getReadyDb();
  await db.runAsync('DELETE FROM notifications');
}

// ── Weekly / Monthly report reminders ────────────────────────────────────────
export async function scheduleWeeklyReminder(): Promise<void> {
  await ExpoNotifications.cancelAllScheduledNotificationsAsync();
  // Every Monday at 08:00
  await ExpoNotifications.scheduleNotificationAsync({
    content: {
      title: '📊 Weekly Report Reminder',
      body: "It's time to generate your weekly temperature report.",
      sound: true,
    },
    trigger: {
      weekday: 2, // Monday (1=Sunday, 2=Monday)
      hour: 8,
      minute: 0,
      repeats: true,
    } as any,
  });
  await sendNotification('weekly', '📊 Weekly Report Reminder', "Weekly report reminder has been scheduled for every Monday at 08:00.");
}

export async function scheduleMonthlyReminder(): Promise<void> {
  // 1st of every month at 09:00
  await ExpoNotifications.scheduleNotificationAsync({
    content: {
      title: '📈 Monthly Report Reminder',
      body: 'Monthly temperature trend analysis is ready for review.',
      sound: true,
    },
    trigger: {
      day: 1,
      hour: 9,
      minute: 0,
      repeats: true,
    } as any,
  });
  await sendNotification('monthly', '📈 Monthly Report Reminder', "Monthly report reminder has been scheduled for the 1st of every month at 09:00.");
}

// Legacy export used by App.tsx
export { requestNotificationPermissions as default };
