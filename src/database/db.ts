import SQLite from 'react-native-sqlite-storage';
import {
  CREATE_DEVICES_TABLE,
  CREATE_READINGS_TABLE,
  CREATE_INCIDENTS_TABLE,
  CREATE_REPORTS_TABLE,
  CREATE_REMINDERS_TABLE,
} from './schema';

SQLite.enablePromise(false);

let db: any | null = null;
let readyPromise: Promise<any> | null = null;

function createWrappedDb(database: any) {
  database.execAsync = (sql: string) => new Promise<void>((resolve, reject) => {
    database.executeSql(sql, [], () => resolve(), (_db: any, err: any) => reject(err));
  });

  database.runAsync = (sql: string, ...params: any[]) => new Promise<void>((resolve, reject) => {
    database.executeSql(sql, params.flat(), () => resolve(), (_db: any, err: any) => reject(err));
  });

  database.getAllAsync = <T>(sql: string, ...params: any[]) => new Promise<T[]>((resolve, reject) => {
    database.executeSql(sql, params.flat(), (_db: any, result: any) => {
      const rows: T[] = [];
      for (let i = 0; i < result.rows.length; i += 1) {
        rows.push(result.rows.item(i));
      }
      resolve(rows);
    }, (_db: any, err: any) => reject(err));
  });

  return database;
}

function openDatabase(): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const database = SQLite.openDatabase(
        { name: 'kumva_insights.db', location: 'default' },
        () => resolve(createWrappedDb(database)),
        (error: any) => reject(error),
      );
    } catch (e) {
      reject(e);
    }
  });
}

export async function getReadyDb(): Promise<any> {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!db) db = await openDatabase();
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(CREATE_DEVICES_TABLE);
      await db.execAsync(CREATE_READINGS_TABLE);
      await db.execAsync(CREATE_INCIDENTS_TABLE);
      await db.execAsync(CREATE_REPORTS_TABLE);
      await db.execAsync(CREATE_REMINDERS_TABLE);
      return db;
    })();
  }
  return readyPromise;
}

export async function initDb(): Promise<void> {
  await getReadyDb();
}

// Alias for backwards compatibility
export const getDB = getReadyDb;
