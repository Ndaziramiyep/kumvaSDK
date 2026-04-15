import { getReadyDb } from '../db';
import { Report } from '../../types/report';

export async function getAllReports(): Promise<Report[]> {
  const db = await getReadyDb();
  if (!db) return [];
  return db.getAllAsync<Report>('SELECT * FROM reports ORDER BY generated DESC');
}

export async function insertReport(report: Omit<Report, 'report_id'>): Promise<void> {
  const db = await getReadyDb();
  if (!db) return;
  await db.runAsync(
    'INSERT INTO reports (filter_categories, time_range_start, time_range_end, file_url, generated) VALUES (?, ?, ?, ?, ?)',
    report.filter_categories ?? null,
    report.time_range_start ?? null,
    report.time_range_end ?? null,
    report.file_url ?? null,
    report.generated
  );
}
