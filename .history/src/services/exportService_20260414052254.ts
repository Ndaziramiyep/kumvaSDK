import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
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

export async function exportExcel(deviceId: string, period: string): Promise<string> {
  const readings = await getReadingsByDevice(deviceId, 1000);
  const incidents = await getIncidentsByDevice(deviceId);

  const readingsData = readings.map(r => ({
    Temperature: r.temperature,
    Humidity: r.humidity,
    Timestamp: new Date(r.timestamp).toLocaleString(),
  }));

  const incidentsData = incidents.map(i => ({
    StartTime: new Date(i.start_time).toLocaleString(),
    EndTime: i.end_time ? new Date(i.end_time).toLocaleString() : 'Ongoing',
    MaxTemperature: i.max_temperature,
  }));

  const wb = XLSX.utils.book_new();
  const readingsSheet = XLSX.utils.json_to_sheet(readingsData);
  XLSX.utils.book_append_sheet(wb, readingsSheet, 'Readings');
  const incidentsSheet = XLSX.utils.json_to_sheet(incidentsData);
  XLSX.utils.book_append_sheet(wb, incidentsSheet, 'Incidents');

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const fileName = `report_${deviceId}_${period}.xlsx`;
  const fileUri = FileSystem.documentDirectory + fileName;
  await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });
  return fileUri;
}
