import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { Platform, Alert } from 'react-native';
import ExcelJS from 'exceljs';
import { getReadingsByDevice } from '../database/repositories/readingRepository';
import { getIncidentsByDevice } from '../database/repositories/incidentRepository';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

/**
 * Save a file to the public Downloads folder (Android) or share via
 * the system share sheet (iOS / fallback). Returns the final path.
 */
async function saveToDownloads(cacheUri: string, filename: string): Promise<string> {
  if (Platform.OS === 'android') {
    // Request media-library permission to write to Downloads
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'granted') {
      try {
        // createAssetAsync moves the file into the public media store
        const asset = await MediaLibrary.createAssetAsync(cacheUri);
        // Optionally put it in a "Kumva Insights" album
        const album = await MediaLibrary.getAlbumAsync('Kumva Insights');
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
          await MediaLibrary.createAlbumAsync('Kumva Insights', asset, false);
        }
        return asset.uri;
      } catch (_) {
        // Fall through to sharing if media library fails (e.g. non-media file)
      }
    }
  }

  // iOS or fallback: open the system share sheet
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(cacheUri, {
      mimeType: cacheUri.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: `Save ${filename}`,
      UTI: cacheUri.endsWith('.pdf') ? 'com.adobe.pdf' : 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
  return cacheUri;
}

// ── PDF ───────────────────────────────────────────────────────────────────────

function buildReportHtml(rows: {
  device: string; category: string; temperature: number | string;
  humidity: number | string; timestamp: string;
}[], startDate: string, endDate: string, category: string): string {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1C1C1E; }
          h1 { color: #5C6BC0; font-size: 22px; margin-bottom: 4px; }
          p  { color: #6B7280; font-size: 13px; margin: 0 0 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #5C6BC0; color: #fff; padding: 10px 12px; text-align: left; }
          td { padding: 9px 12px; border-bottom: 1px solid #E5E7EB; }
          tr:nth-child(even) td { background: #F8F9FF; }
        </style>
      </head>
      <body>
        <h1>Kumva Insights — Temperature Report</h1>
        <p>Category: ${category} &nbsp;|&nbsp; Period: ${startDate} → ${endDate}</p>
        <table>
          <tr><th>Device</th><th>Category</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Date</th></tr>
          ${rows.map(r => `<tr><td>${r.device}</td><td>${r.category}</td><td>${r.temperature}</td><td>${r.humidity}</td><td>${r.timestamp}</td></tr>`).join('')}
        </table>
      </body>
    </html>
  `;
}

export async function exportReportPdf(
  rows: { device: string; category: string; temperature: number | string; humidity: number | string; timestamp: string }[],
  startDate: string,
  endDate: string,
  category: string,
): Promise<string> {
  const html = buildReportHtml(rows, startDate, endDate, category);
  const { uri: cacheUri } = await Print.printToFileAsync({ html });

  const filename = `kumva_report_${timestamp()}.pdf`;
  // Rename in cache so the share sheet shows a proper filename
  const namedUri = FileSystem.cacheDirectory + filename;
  await FileSystem.moveAsync({ from: cacheUri, to: namedUri });

  return saveToDownloads(namedUri, filename);
}

// ── Excel ─────────────────────────────────────────────────────────────────────

function applyHeaderStyle(sheet: ExcelJS.Worksheet, columns: { header: string; key: string; width: number }[]) {
  sheet.columns = columns;
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C6BC0' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

export async function exportReportExcel(
  rows: { device: string; category: string; temperature: number | string; humidity: number | string; timestamp: string }[],
  startDate: string,
  endDate: string,
  category: string,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kumva Insights';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Report');
  applyHeaderStyle(sheet, [
    { header: 'Device',         key: 'device',      width: 24 },
    { header: 'Category',       key: 'category',    width: 16 },
    { header: 'Temp (°C)',      key: 'temperature', width: 14 },
    { header: 'Humidity (%)',   key: 'humidity',    width: 14 },
    { header: 'Date',           key: 'timestamp',   width: 22 },
  ]);
  rows.forEach(r => sheet.addRow(r));

  // Summary row
  sheet.addRow({});
  const summaryRow = sheet.addRow({ device: `Period: ${startDate} → ${endDate}`, category: `Category: ${category}` });
  summaryRow.font = { italic: true, color: { argb: 'FF6B7280' } };

  const buffer = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const filename = `kumva_report_${timestamp()}.xlsx`;
  const cacheUri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  return saveToDownloads(cacheUri, filename);
}

// ── Legacy device-level exports (used by DeviceDetailScreen) ──────────────────

export async function exportPdf(deviceId: string, period: string): Promise<string> {
  const readings  = await getReadingsByDevice(deviceId, 1000);
  const incidents = await getIncidentsByDevice(deviceId);

  const rows = readings.map(r => ({
    device: deviceId, category: '', temperature: r.temperature,
    humidity: r.humidity ?? '--',
    timestamp: new Date(r.timestamp).toLocaleString(),
  }));

  return exportReportPdf(rows, period, '', 'All');
}

export async function exportExcel(deviceId: string, period: string): Promise<string> {
  const readings = await getReadingsByDevice(deviceId, 1000);
  const rows = readings.map(r => ({
    device: deviceId, category: '', temperature: r.temperature,
    humidity: r.humidity ?? '--',
    timestamp: new Date(r.timestamp).toLocaleString(),
  }));
  return exportReportExcel(rows, period, '', 'All');
}
