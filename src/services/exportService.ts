import * as Print from 'expo-print';
import * as LegacyFS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import ExcelJS from 'exceljs';
import { Device } from '../types/device';
import { Reading } from '../types/reading';
import { getReadingsByDevice } from '../database/repositories/readingRepository';

// ── Timestamp ─────────────────────────────────────────────────────────────────
function ts(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtDT(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().replace('T',' ').substring(0,19) + ' CAT';
}

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().substring(0,10);
}

// ── Save file ─────────────────────────────────────────────────────────────────
async function saveFile(cacheUri: string, filename: string, mimeType: string): Promise<string> {
  if (Platform.OS === 'android') {
    try {
      const downloadsUri = LegacyFS.StorageAccessFramework.getUriForDirectoryInRoot('Download');
      const permissions  = await LegacyFS.StorageAccessFramework.requestDirectoryPermissionsAsync(downloadsUri);
      if (permissions.granted) {
        const destUri = await LegacyFS.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          filename.replace(/\.[^.]+$/, ''),
          mimeType,
        );
        const content = await LegacyFS.readAsStringAsync(cacheUri, { encoding: LegacyFS.EncodingType.Base64 });
        await LegacyFS.StorageAccessFramework.writeAsStringAsync(destUri, content, { encoding: LegacyFS.EncodingType.Base64 });
        await LegacyFS.deleteAsync(cacheUri, { idempotent: true });
        return destUri;
      }
    } catch (e) {
      console.warn('[Export] SAF failed, falling back to share sheet', e);
    }
  }
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(cacheUri, {
    mimeType,
    dialogTitle: `Save ${filename}`,
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.spreadsheetml.sheet',
  });
  return cacheUri;
}

// ── SVG line graph ────────────────────────────────────────────────────────────
function buildSvgGraph(readings: Reading[], highThreshold: number, lowThreshold: number): string {
  const W = 580, H = 120, PAD = { top: 10, right: 10, bottom: 30, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  if (readings.length < 2) {
    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="11" fill="#9CA3AF">No data</text>
    </svg>`;
  }

  const temps = readings.map(r => r.temperature);
  const hums  = readings.map(r => r.humidity ?? 0);
  const times = readings.map(r => r.timestamp);

  const minT = Math.min(...temps, lowThreshold) - 2;
  const maxT = Math.max(...temps, highThreshold) + 2;
  const minH = Math.min(...hums) - 5;
  const maxH = Math.max(...hums) + 5;
  const minTime = times[0], maxTime = times[times.length - 1];
  const timeRange = maxTime - minTime || 1;

  const tx = (t: number) => PAD.left + ((t - minTime) / timeRange) * plotW;
  const tyT = (v: number) => PAD.top + plotH - ((v - minT) / (maxT - minT)) * plotH;
  const tyH = (v: number) => PAD.top + plotH - ((v - minH) / (maxH - minH)) * plotH;

  // Build polyline points
  const tempPts = readings.map(r => `${tx(r.timestamp).toFixed(1)},${tyT(r.temperature).toFixed(1)}`).join(' ');
  const humPts  = readings.map(r => `${tx(r.timestamp).toFixed(1)},${tyH(r.humidity ?? 0).toFixed(1)}`).join(' ');

  // X axis labels (5 evenly spaced)
  const xLabels = Array.from({length: 5}, (_, i) => {
    const t = minTime + (i / 4) * timeRange;
    const d = new Date(t);
    return { x: tx(t), label: `${d.toLocaleString('en',{month:'short'})} ${d.getDate()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` };
  });

  // Y axis labels (5 evenly spaced for temp)
  const yLabels = Array.from({length: 5}, (_, i) => {
    const v = maxT - (i / 4) * (maxT - minT);
    return { y: tyT(v), label: v.toFixed(0) };
  });

  const highY = tyT(highThreshold);
  const lowY  = tyT(lowThreshold);

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Grid lines -->
    ${yLabels.map(l => `<line x1="${PAD.left}" y1="${l.y.toFixed(1)}" x2="${W-PAD.right}" y2="${l.y.toFixed(1)}" stroke="#E5E7EB" stroke-width="0.5"/>`).join('')}
    <!-- Threshold lines -->
    <line x1="${PAD.left}" y1="${highY.toFixed(1)}" x2="${W-PAD.right}" y2="${highY.toFixed(1)}" stroke="#EF4444" stroke-width="1" stroke-dasharray="4,3"/>
    <line x1="${PAD.left}" y1="${lowY.toFixed(1)}"  x2="${W-PAD.right}" y2="${lowY.toFixed(1)}"  stroke="#3B82F6" stroke-width="1" stroke-dasharray="4,3"/>
    <!-- Humidity line -->
    <polyline points="${humPts}" fill="none" stroke="#06B6D4" stroke-width="1" opacity="0.6"/>
    <!-- Temperature line -->
    <polyline points="${tempPts}" fill="none" stroke="#22C55E" stroke-width="1.5"/>
    <!-- Axes -->
    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top+plotH}" stroke="#9CA3AF" stroke-width="1"/>
    <line x1="${PAD.left}" y1="${PAD.top+plotH}" x2="${W-PAD.right}" y2="${PAD.top+plotH}" stroke="#9CA3AF" stroke-width="1"/>
    <!-- Y labels -->
    ${yLabels.map(l => `<text x="${PAD.left-4}" y="${(l.y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="#6B7280">${l.label}</text>`).join('')}
    <!-- X labels -->
    ${xLabels.map(l => `<text x="${l.x.toFixed(1)}" y="${PAD.top+plotH+10}" text-anchor="middle" font-size="7" fill="#6B7280">${l.label}</text>`).join('')}
  </svg>`;
}

// ── Kumva logo SVG ────────────────────────────────────────────────────────────
const KUMVA_LOGO_SVG = `<svg width="80" height="32" viewBox="0 0 80 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="14" fill="#5C6BC0" opacity="0.15"/>
  <text x="16" y="21" text-anchor="middle" font-size="13" font-weight="bold" fill="#5C6BC0">K</text>
  <text x="36" y="14" font-size="11" font-weight="bold" fill="#1C1C1E">Kumva</text>
  <text x="36" y="26" font-size="8" fill="#6B7280">Insights</text>
  <!-- wifi arcs -->
  <path d="M68 20 Q72 14 76 20" fill="none" stroke="#5C6BC0" stroke-width="1.5"/>
  <path d="M66 22 Q72 12 78 22" fill="none" stroke="#5C6BC0" stroke-width="1.5" opacity="0.6"/>
  <circle cx="72" cy="22" r="1.5" fill="#5C6BC0"/>
</svg>`;

// ── Full HTML report ──────────────────────────────────────────────────────────
export interface DeviceReport {
  device: Device;
  readings: Reading[];
}

function buildFullReportHtml(
  deviceReports: DeviceReport[],
  startDate: number,
  endDate: number,
  categoryLabel: string,
  reportTitle: string,
): string {
  const now = new Date();
  const generatedAt = fmtDT(now.getTime());
  const periodStr   = `${fmtDate(startDate)} 00:00:00 CAT to ${fmtDate(endDate)} 23:59:59 CAT`;

  // ── Page 1: Cover + Legend ──────────────────────────────────────────────────
  const legendRows = deviceReports.map((dr, i) => {
    const code = dr.device.name.replace(/\s+/g,'').substring(0,8).toUpperCase();
    return `<tr>
      <td style="font-weight:bold;padding:3px 8px;font-size:10px">${code}</td>
      <td style="padding:3px 8px;font-size:10px">${dr.device.name} — ${dr.device.category.replace('_',' ')}</td>
    </tr>`;
  }).join('');

  // ── Pages 2+: One per device ────────────────────────────────────────────────
  const devicePages = deviceReports.map(dr => {
    const { device, readings } = dr;
    const code = device.name.replace(/\s+/g,'').substring(0,8).toUpperCase();
    const svgGraph = buildSvgGraph(readings, device.temp_high_threshold, device.temp_low_threshold);

    const tableRows = readings.map((r, i) =>
      `<tr style="background:${i%2===0?'#fff':'#F8F9FF'}">
        <td>${fmtDT(r.timestamp)}</td>
        <td>${r.humidity != null ? r.humidity.toFixed(2) : '--'}</td>
        <td>${r.humidity != null ? r.humidity.toFixed(2) : '--'}</td>
        <td>${r.humidity != null ? r.humidity.toFixed(2) : '--'}</td>
        <td>${r.temperature.toFixed(2)}</td>
        <td>${device.temp_low_threshold.toFixed(2)}</td>
        <td>${device.temp_high_threshold.toFixed(2)}</td>
      </tr>`
    ).join('');

    return `
    <div style="page-break-before:always">
      <p style="font-size:10px;font-weight:bold;margin:0 0 6px">
        ${code} ${device.name}. Device ID: ${device.mac_address}.
      </p>
      <div style="border:1px solid #E5E7EB;padding:8px;margin-bottom:8px">
        ${svgGraph}
        <!-- Legend -->
        <div style="display:flex;gap:16px;margin-top:6px;font-size:9px;color:#6B7280">
          <span><span style="display:inline-block;width:20px;height:2px;background:#06B6D4;vertical-align:middle"></span> humidity</span>
          <span><span style="display:inline-block;width:20px;height:2px;background:#22C55E;vertical-align:middle"></span> temperature</span>
          <span><span style="display:inline-block;width:20px;height:2px;background:#3B82F6;border-top:1px dashed #3B82F6;vertical-align:middle"></span> humidity_threshold</span>
          <span><span style="display:inline-block;width:20px;height:2px;background:#EF4444;border-top:1px dashed #EF4444;vertical-align:middle"></span> temperature_threshold</span>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9px">
        <thead>
          <tr style="background:#5C6BC0;color:#fff">
            <th style="padding:4px 6px;text-align:left">Date</th>
            <th style="padding:4px 6px">humidity<br/>${code}<br/>min</th>
            <th style="padding:4px 6px">humidity<br/>${code}<br/>max</th>
            <th style="padding:4px 6px">humidity<br/>${code}<br/>mean</th>
            <th style="padding:4px 6px">temperature<br/>${code}<br/>min</th>
            <th style="padding:4px 6px">temperature<br/>${code}<br/>max</th>
            <th style="padding:4px 6px">temperature<br/>${code}<br/>mean</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1C1C1E; padding: 20px; }
    @page { margin: 15mm; }
    .page-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #5C6BC0; padding-bottom: 8px; margin-bottom: 12px; }
    .report-title { text-align: center; font-size: 16px; font-weight: bold; margin: 12px 0 6px; }
    .meta { font-size: 10px; color: #374151; margin-bottom: 4px; }
    .legend-box { border: 1px solid #E5E7EB; padding: 12px; margin-top: 12px; }
    .legend-title { font-weight: bold; text-align: center; margin-bottom: 8px; font-size: 12px; }
    table { border-collapse: collapse; }
    th, td { text-align: left; }
  </style>
</head>
<body>

  <!-- PAGE 1: Cover -->
  <div class="page-header">
    <div style="font-size:14px;font-weight:bold;color:#5C6BC0">Kumva Insights</div>
    ${KUMVA_LOGO_SVG}
  </div>

  <div class="report-title">${reportTitle}</div>
  <div class="meta">Hour and date: ${generatedAt}</div>
  <div class="meta">Period: ${periodStr}</div>

  <div class="legend-box">
    <div class="legend-title">Legend</div>
    <p style="font-size:10px;color:#6B7280;margin-bottom:8px">Legend.</p>
    <div style="border:1px solid #E5E7EB;padding:12px;display:inline-block;min-width:300px">
      <table>
        <tbody>${legendRows}</tbody>
      </table>
    </div>
  </div>

  <!-- PAGES 2+: Per device -->
  ${devicePages}

</body>
</html>`;
}

// ── Public PDF export ─────────────────────────────────────────────────────────
export async function exportReportPdf(
  rows: { device: string; category: string; temperature: number | string; humidity: number | string; timestamp: string }[],
  startDate: string,
  endDate: string,
  category: string,
): Promise<string> {
  // Legacy flat-row export — build a simple HTML
  const tableRows = rows.map(r =>
    `<tr><td>${r.device}</td><td>${r.category}</td><td>${r.temperature}</td><td>${r.humidity}</td><td>${r.timestamp}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body{font-family:Arial,sans-serif;padding:20px;font-size:11px}
    h1{color:#5C6BC0;font-size:16px;margin-bottom:4px}
    p{color:#6B7280;font-size:10px;margin:0 0 12px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:#5C6BC0;color:#fff;padding:6px 8px;text-align:left}
    td{padding:5px 8px;border-bottom:1px solid #E5E7EB}
    tr:nth-child(even) td{background:#F8F9FF}
  </style></head><body>
    <h1>Kumva Insights — Report</h1>
    <p>Category: ${category} | Period: ${startDate} → ${endDate} | ${rows.length} record(s)</p>
    <table><thead><tr><th>Device</th><th>Category</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Date &amp; Time</th></tr></thead>
    <tbody>${tableRows}</tbody></table>
  </body></html>`;

  const { uri: tmpUri } = await Print.printToFileAsync({ html, base64: false });
  const filename = `kumva_report_${ts()}.pdf`;
  const cacheUri = `${LegacyFS.cacheDirectory}${filename}`;
  await LegacyFS.moveAsync({ from: tmpUri, to: cacheUri });
  return saveFile(cacheUri, filename, 'application/pdf');
}

/**
 * Full multi-page PDF report matching the image format.
 * Pass devices + their readings directly.
 */
export async function exportFullReportPdf(
  deviceReports: DeviceReport[],
  startDate: number,
  endDate: number,
  categoryLabel: string,
): Promise<string> {
  const now = new Date();
  const monthName = now.toLocaleString('en', { month: 'long' });
  const title = `Kumva Insights ${monthName} Report`;

  const html = buildFullReportHtml(deviceReports, startDate, endDate, categoryLabel, title);
  const { uri: tmpUri } = await Print.printToFileAsync({ html, base64: false });
  const filename = `kumva_report_${ts()}.pdf`;
  const cacheUri = `${LegacyFS.cacheDirectory}${filename}`;
  await LegacyFS.moveAsync({ from: tmpUri, to: cacheUri });
  return saveFile(cacheUri, filename, 'application/pdf');
}

// ── Excel export ──────────────────────────────────────────────────────────────
function applyHeader(sheet: ExcelJS.Worksheet, cols: { header: string; key: string; width: number }[]) {
  sheet.columns = cols;
  sheet.getRow(1).eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C6BC0' } };
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
  applyHeader(sheet, [
    { header: 'Device',       key: 'device',      width: 24 },
    { header: 'Category',     key: 'category',    width: 16 },
    { header: 'Temp (°C)',    key: 'temperature', width: 14 },
    { header: 'Humidity (%)', key: 'humidity',    width: 14 },
    { header: 'Date & Time',  key: 'timestamp',   width: 26 },
  ]);
  rows.forEach(r => sheet.addRow(r));
  sheet.addRow({});
  const footer = sheet.addRow({
    device: `Period: ${startDate} → ${endDate}`,
    category: `Category: ${category}`,
    temperature: `Total: ${rows.length} record(s)`,
  });
  footer.font = { italic: true, color: { argb: 'FF6B7280' } };

  const buffer   = await wb.xlsx.writeBuffer();
  const base64   = Buffer.from(buffer).toString('base64');
  const filename = `kumva_report_${ts()}.xlsx`;
  const cacheUri = `${LegacyFS.cacheDirectory}${filename}`;
  await LegacyFS.writeAsStringAsync(cacheUri, base64, { encoding: LegacyFS.EncodingType.Base64 });
  return saveFile(cacheUri, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/**
 * Full multi-sheet Excel report — one sheet per device.
 */
export async function exportFullReportExcel(
  deviceReports: DeviceReport[],
  startDate: number,
  endDate: number,
  categoryLabel: string,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kumva Insights';
  wb.created = new Date();

  // Cover sheet
  const cover = wb.addWorksheet('Report Info');
  cover.getCell('A1').value = 'Kumva Insights Report';
  cover.getCell('A1').font  = { bold: true, size: 14, color: { argb: 'FF5C6BC0' } };
  cover.getCell('A2').value = `Category: ${categoryLabel}`;
  cover.getCell('A3').value = `Period: ${fmtDate(startDate)} to ${fmtDate(endDate)}`;
  cover.getCell('A4').value = `Generated: ${fmtDT(Date.now())}`;
  cover.getCell('A4').font  = { italic: true, color: { argb: 'FF6B7280' } };
  cover.addRow([]);
  cover.addRow(['Device Code', 'Device Name', 'Category', 'MAC Address']);
  cover.getRow(6).font = { bold: true };
  deviceReports.forEach(dr => {
    const code = dr.device.name.replace(/\s+/g,'').substring(0,8).toUpperCase();
    cover.addRow([code, dr.device.name, dr.device.category.replace('_',' '), dr.device.mac_address]);
  });
  cover.getColumn('A').width = 14;
  cover.getColumn('B').width = 28;
  cover.getColumn('C').width = 16;
  cover.getColumn('D').width = 20;

  // One sheet per device
  deviceReports.forEach(dr => {
    const { device, readings } = dr;
    const sheetName = device.name.substring(0, 31); // Excel sheet name limit
    const sheet = wb.addWorksheet(sheetName);
    applyHeader(sheet, [
      { header: 'Date & Time',      key: 'timestamp',   width: 22 },
      { header: 'Humidity Min (%)', key: 'hum_min',     width: 16 },
      { header: 'Humidity Max (%)', key: 'hum_max',     width: 16 },
      { header: 'Humidity Mean(%)', key: 'hum_mean',    width: 16 },
      { header: 'Temp Min (°C)',    key: 'temp_min',    width: 14 },
      { header: 'Temp Max (°C)',    key: 'temp_max',    width: 14 },
      { header: 'Temp Mean (°C)',   key: 'temp_mean',   width: 14 },
    ]);
    readings.forEach(r => {
      sheet.addRow({
        timestamp: fmtDT(r.timestamp),
        hum_min:   r.humidity != null ? +r.humidity.toFixed(2) : null,
        hum_max:   r.humidity != null ? +r.humidity.toFixed(2) : null,
        hum_mean:  r.humidity != null ? +r.humidity.toFixed(2) : null,
        temp_min:  +r.temperature.toFixed(2),
        temp_max:  +r.temperature.toFixed(2),
        temp_mean: +r.temperature.toFixed(2),
      });
    });
  });

  const buffer   = await wb.xlsx.writeBuffer();
  const base64   = Buffer.from(buffer).toString('base64');
  const filename = `kumva_report_${ts()}.xlsx`;
  const cacheUri = `${LegacyFS.cacheDirectory}${filename}`;
  await LegacyFS.writeAsStringAsync(cacheUri, base64, { encoding: LegacyFS.EncodingType.Base64 });
  return saveFile(cacheUri, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ── Legacy device-level exports ───────────────────────────────────────────────
export async function exportPdf(deviceId: string, period: string): Promise<string> {
  const readings = await getReadingsByDevice(deviceId, 1000);
  return exportReportPdf(
    readings.map(r => ({ device: deviceId, category: '', temperature: r.temperature, humidity: r.humidity ?? '--', timestamp: new Date(r.timestamp).toLocaleString() })),
    period, '', 'All',
  );
}

export async function exportExcel(deviceId: string, period: string): Promise<string> {
  const readings = await getReadingsByDevice(deviceId, 1000);
  return exportReportExcel(
    readings.map(r => ({ device: deviceId, category: '', temperature: r.temperature, humidity: r.humidity ?? '--', timestamp: new Date(r.timestamp).toLocaleString() })),
    period, '', 'All',
  );
}
