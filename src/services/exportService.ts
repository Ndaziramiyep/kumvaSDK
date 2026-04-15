import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import ExcelJS from 'exceljs';
import { getReadingsByDevice } from '../database/repositories/readingRepository';
import { getIncidentsByDevice } from '../database/repositories/incidentRepository';

export async function exportPdf(deviceId: string, period: string): Promise<string> {
  const readings = await getReadingsByDevice(deviceId, 1000);
  const incidents = await getIncidentsByDevice(deviceId);

  const html = `
    <html>
      <body>
        <h1>Temperature Report for Device ${deviceId}</h1>
        <h2>Period: ${period}</h2>
        <h3>Readings</h3>
        <table border="1">
          <tr><th>Temperature</th><th>Humidity</th><th>Timestamp</th></tr>
          ${readings.map(r => `<tr><td>${r.temperature}</td><td>${r.humidity}</td><td>${new Date(r.timestamp).toLocaleString()}</td></tr>`).join('')}
        </table>
        <h3>Incidents</h3>
        <table border="1">
          <tr><th>Start Time</th><th>End Time</th><th>Max Temperature</th></tr>
          ${incidents.map(i => `<tr><td>${new Date(i.start_time).toLocaleString()}</td><td>${i.end_time ? new Date(i.end_time).toLocaleString() : 'Ongoing'}</td><td>${i.max_temperature}</td></tr>`).join('')}
        </table>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

function applyHeaderStyle(sheet: ExcelJS.Worksheet, columns: { header: string; key: string; width: number }[]) {
  sheet.columns = columns;
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C6BC0' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

export async function exportExcel(deviceId: string, period: string): Promise<string> {
  const readings = await getReadingsByDevice(deviceId, 1000);
  const incidents = await getIncidentsByDevice(deviceId);

  const wb = new ExcelJS.Workbook();

  const readingsSheet = wb.addWorksheet('Readings');
  applyHeaderStyle(readingsSheet, [
    { header: 'Temperature (°C)', key: 'temperature', width: 20 },
    { header: 'Humidity (%)', key: 'humidity', width: 16 },
    { header: 'Timestamp', key: 'timestamp', width: 24 },
  ]);
  readings.forEach(r => readingsSheet.addRow({
    temperature: r.temperature,
    humidity: r.humidity,
    timestamp: new Date(r.timestamp).toLocaleString(),
  }));

  const incidentsSheet = wb.addWorksheet('Incidents');
  applyHeaderStyle(incidentsSheet, [
    { header: 'Start Time', key: 'start_time', width: 24 },
    { header: 'End Time', key: 'end_time', width: 24 },
    { header: 'Max Temperature (°C)', key: 'max_temperature', width: 22 },
  ]);
  incidents.forEach(i => incidentsSheet.addRow({
    start_time: new Date(i.start_time).toLocaleString(),
    end_time: i.end_time ? new Date(i.end_time).toLocaleString() : 'Ongoing',
    max_temperature: i.max_temperature,
  }));

  const buffer = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const fileUri = FileSystem.documentDirectory + `report_${deviceId}_${period}.xlsx`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return fileUri;
}
