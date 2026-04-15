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

  const db = await SQLite.openDatabase({ name: 'kumva_insights.db', location: 'default' });

  // Wrap into the shape the rest of the app expects
  db.execAsync = (sql: string) => db.executeSql(sql, []);

  db.runAsync = (sql: string, ...params: any[]) =>
    db.executeSql(sql, params.flat());

  db.getAllAsync = async <T>(sql: string, ...params: any[]): Promise<T[]> => {
    const [results] = await db.executeSql(sql, params.flat());
    const rows: T[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      rows.push(results.rows.item(i));
    }
    return rows;
  };

  await db.executeSql('PRAGMA foreign_keys = ON;');
  await db.executeSql(CREATE_DEVICES_TABLE);
  await db.executeSql(CREATE_READINGS_TABLE);
  await db.executeSql(CREATE_INCIDENTS_TABLE);
  await db.executeSql(CREATE_REPORTS_TABLE);
  await db.executeSql(CREATE_REMINDERS_TABLE);

  readyDb = db;
  return readyDb;
}

export async function initDb(): Promise<void> {
  await getReadyDb();
}

export const getDB = getReadyDb;
