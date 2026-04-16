import SQLite from 'react-native-sqlite-storage';
import {
  CREATE_DEVICES_TABLE,
  CREATE_READINGS_TABLE,
  CREATE_INCIDENTS_TABLE,
  CREATE_REPORTS_TABLE,
  CREATE_REMINDERS_TABLE,
} from './schema';

SQLite.enablePromise(true);

let readyDb: any | null = null;

export async function getReadyDb(): Promise<any> {
  if (readyDb) return readyDb;

  const raw = await SQLite.openDatabase({ name: 'kumva_insights.db', location: 'default' });
  const db: any = raw;

  // Wrap into the shape the rest of the app expects
  db.execAsync = (sql: string) => raw.executeSql(sql, []);

  db.runAsync = (sql: string, ...params: any[]) =>
    raw.executeSql(sql, params.flat());

  db.getAllAsync = async <T>(sql: string, ...params: any[]): Promise<T[]> => {
    const [results] = await raw.executeSql(sql, params.flat());
    const rows: T[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      rows.push(results.rows.item(i));
    }
    return rows;
  };

  await raw.executeSql('PRAGMA foreign_keys = ON;');
  await raw.executeSql(CREATE_DEVICES_TABLE);
  await raw.executeSql(CREATE_READINGS_TABLE);
  await raw.executeSql(CREATE_INCIDENTS_TABLE);
  await raw.executeSql(CREATE_REPORTS_TABLE);
  await raw.executeSql(CREATE_REMINDERS_TABLE);

  readyDb = db;
  return readyDb;
}

export async function purgeOldData(): Promise<void> {
  const db = await getReadyDb();
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  await db.runAsync('DELETE FROM readings WHERE timestamp < ?', cutoff);
  await db.runAsync('DELETE FROM incidents WHERE start_time < ?', cutoff);
}

export async function initDb(): Promise<void> {
  await getReadyDb();
  await purgeOldData();
}

export const getDB = getReadyDb;
