export const CREATE_DEVICES_TABLE = `
  CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    mac_address TEXT NOT NULL UNIQUE,
    temp_low_threshold REAL NOT NULL DEFAULT -20,
    temp_high_threshold REAL NOT NULL DEFAULT 0,
    battery_level INTEGER,
    last_sync INTEGER,
    created_at INTEGER NOT NULL
  );
`;

export const CREATE_READINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS readings (
    reading_id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    temperature REAL NOT NULL,
    humidity REAL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
  );
`;

export const CREATE_INCIDENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS incidents (
    incident_id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    max_temperature REAL NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
  );
`;

export const CREATE_REPORTS_TABLE = `
  CREATE TABLE IF NOT EXISTS reports (
    report_id INTEGER PRIMARY KEY AUTOINCREMENT,
    filter_categories TEXT,
    time_range_start INTEGER,
    time_range_end INTEGER,
    file_url TEXT,
    generated INTEGER NOT NULL
  );
`;

export const CREATE_REMINDERS_TABLE = `
  CREATE TABLE IF NOT EXISTS reminders (
    reminder_id INTEGER PRIMARY KEY AUTOINCREMENT,
    frequency TEXT NOT NULL,
    last_sent INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1
  );
`;
