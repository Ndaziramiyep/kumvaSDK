import * as SQLite from 'expo-sqlite';
import {
  CREATE_DEVICES_TABLE,
  CREATE_READINGS_TABLE,
  CREATE_INCIDENTS_TABLE,
  CREATE_REPORTS_TABLE,
  CREATE_REMINDERS_TABLE,
} from './schema';

let db: SQLite.SQLiteDatabase | null = null;
let readyPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) db = SQLite.openDatabaseSync('kumva_insights.db');
  return db;
}

export async function getReadyDb(): Promise<SQLite.SQLiteDatabase> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const database = getDb();
      await database.execAsync('PRAGMA foreign_keys = ON;');
      await database.execAsync(CREATE_DEVICES_TABLE);
      await database.execAsync(CREATE_READINGS_TABLE);
      await database.execAsync(CREATE_INCIDENTS_TABLE);
      await database.execAsync(CREATE_REPORTS_TABLE);
      await database.execAsync(CREATE_REMINDERS_TABLE);
      return database;
    })();
  }
  return readyPromise;
}

export async function initDb(): Promise<void> {
  await getReadyDb();
}
