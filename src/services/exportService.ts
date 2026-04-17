import * as Print from 'expo-print';
import * as LegacyFS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import ExcelJS from 'exceljs';
import { Device } from '../types/device';
import { Reading } from '../types/reading';
import { getReadingsByDevice } from '../database/repositories/readingRepository';
import { KUMVA_LOGO_BASE64 } from './logoBase64';

// ── Logo helpers ─────────────────────────────────────────────────────────────────
const LOGO_DATA_URI = `data:image/png;base64,${KUMVA_LOGO_BASE64}`;
const LOGO_HTML     = `<img src="${LOGO_DATA_URI}" style="height:60px;width:auto;object-fit:contain" alt="Kumva Insights"/>`;

function getLogoDataUri(): string  { return LOGO_DATA_URI; }
function getLogoBase64(): string   { return KUMVA_LOGO_BASE64; }

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

// ── SVG graph builder (single metric) ────────────────────────────────────────
function buildSvgLine(
  readings: Reading[],
  getValue: (r: Reading) => number | null,
  color: string,
  thresholdHigh?: number,
  thresholdLow?: number,
  unit: string = '',
): string {
  const W = 580, H = 140, PAD = { top: 14, right: 12, bottom: 36, left: 44 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const validReadings = readings.filter(r => getValue(r) !== null);
  if (validReadings.length < 2) {
    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#FAFBFF" rx="4"/>
      <text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="11" fill="#9CA3AF">No data</text>
    </svg>`;
  }

  const values = validReadings.map(r => getValue(r) as number);
  const times  = validReadings.map(r => r.timestamp);

  const extras: number[] = [];
  if (thresholdHigh !== undefined) extras.push(thresholdHigh);
  if (thresholdLow  !== undefined) extras.push(thresholdLow);

  const minV = Math.min(...values, ...extras) - 2;
  const maxV = Math.max(...values, ...extras) + 2;
  const range = maxV - minV || 1;

  const minTime = times[0], maxTime = times[times.length - 1];
  const timeRange = maxTime - minTime || 1;

  const tx = (t: number) => PAD.left + ((t - minTime) / timeRange) * plotW;
  const ty = (v: number) => PAD.top + plotH - ((v - minV) / range) * plotH;

  const pts = validReadings.map(r => `${tx(r.timestamp).toFixed(1)},${ty(getValue(r) as number).toFixed(1)}`).join(' ');

  const xLabels = Array.from({ length: 5 }, (_, i) => {
    const t = minTime + (i / 4) * timeRange;
    const d = new Date(t);
    return { x: tx(t), label: `${d.toLocaleString('en',{month:'short'})} ${d.getDate()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` };
  });

  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const v = maxV - (i / 4) * (maxV - minV);
    return { y: ty(v), label: `${v.toFixed(1)}${unit}` };
  });

  const highY = thresholdHigh !== undefined ? ty(thresholdHigh) : null;
  const lowY  = thresholdLow  !== undefined ? ty(thresholdLow)  : null;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#FAFBFF" rx="4"/>
    ${yLabels.map(l => `<line x1="${PAD.left}" y1="${l.y.toFixed(1)}" x2="${W-PAD.right}" y2="${l.y.toFixed(1)}" stroke="#E5E7EB" stroke-width="0.5"/>`)  .join('')}
    ${highY !== null ? `<line x1="${PAD.left}" y1="${highY.toFixed(1)}" x2="${W-PAD.right}" y2="${highY.toFixed(1)}" stroke="#EF4444" stroke-width="1" stroke-dasharray="4,3"/>` : ''}
    ${lowY  !== null ? `<line x1="${PAD.left}" y1="${lowY.toFixed(1)}"  x2="${W-PAD.right}" y2="${lowY.toFixed(1)}"  stroke="#3B82F6" stroke-width="1" stroke-dasharray="4,3"/>` : ''}
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>
    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top+plotH}" stroke="#9CA3AF" stroke-width="1"/>
    <line x1="${PAD.left}" y1="${PAD.top+plotH}" x2="${W-PAD.right}" y2="${PAD.top+plotH}" stroke="#9CA3AF" stroke-width="1"/>
    ${yLabels.map(l => `<text x="${PAD.left-4}" y="${(l.y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="#6B7280">${l.label}</text>`).join('')}
    ${xLabels.map(l => `<text x="${l.x.toFixed(1)}" y="${PAD.top+plotH+10}" text-anchor="middle" font-size="7" fill="#6B7280">${l.label}</text>`).join('')}
  </svg>`;
}

function buildTempGraph(readings: Reading[], highThreshold: number, lowThreshold: number): string {
  return buildSvgLine(readings, r => r.temperature, '#22C55E', highThreshold, lowThreshold, '°C');
}

function buildHumGraph(readings: Reading[]): string {
  const hasHumidity = readings.some(r => r.humidity != null);
  if (!hasHumidity) return '';
  return buildSvgLine(readings, r => r.humidity ?? null, '#06B6D4', undefined, undefined, '%');
}

// ── Device abbreviation: 3–4 uppercase letters ───────────────────────────────
function makeAbbrev(name: string, index: number): string {
  const words = name.trim().split(/\s+/);
  // Take first letter of each word
  let abbrev = words.map(w => w[0] ?? '').join('').toUpperCase();
  // Trim to max 4
  abbrev = abbrev.substring(0, 4);
  // If too short, pad with consonants from first word
  if (abbrev.length < 3) {
    const extra = (words[0] ?? '').replace(/[aeiouAEIOU\s]/g, '').toUpperCase();
    abbrev = (abbrev + extra).substring(0, 4);
  }
  if (abbrev.length < 3) abbrev = name.replace(/\s+/g,'').substring(0,4).toUpperCase();
  return abbrev + (index + 1);
}

// ── Kumva logo SVG (large, matches header size) ───────────────────────────────
const KUMVA_LOGO_SVG = `<svg width="140" height="56" viewBox="0 0 140 56" xmlns="http://www.w3.org/2000/svg">
  <!-- Circle background -->
  <circle cx="28" cy="28" r="24" fill="#EEF0FB"/>
  <!-- K letter -->
  <text x="28" y="36" text-anchor="middle" font-size="22" font-weight="bold" fill="#5C6BC0">K</text>
  <!-- Brand name -->
  <text x="62" y="24" font-size="18" font-weight="bold" fill="#1C1C1E">Kumva</text>
  <text x="62" y="42" font-size="12" fill="#6B7280">Insights</text>
  <!-- Wifi signal arcs -->
  <path d="M118 36 Q124 26 130 36" fill="none" stroke="#5C6BC0" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M114 40 Q124 22 134 40" fill="none" stroke="#5C6BC0" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
  <circle cx="124" cy="40" r="2.5" fill="#5C6BC0"/>
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
  aggregateLabel: string = 'Daily',
): string {
  const now = new Date();
  const generatedAt = fmtDT(now.getTime());
  const periodStr   = `${fmtDate(startDate)} 00:00:00 CAT to ${fmtDate(endDate)} 23:59:59 CAT`;
  const logoHtml    = LOGO_HTML;

  // ── Page 1: Cover + Legend ──────────────────────────────────────────────────
  const legendRows = deviceReports.map((dr, i) => {
    const code = makeAbbrev(dr.device.name, i);
    return `<tr>
      <td style="font-weight:bold;padding:4px 10px;font-size:10px;white-space:nowrap">${code}</td>
      <td style="padding:4px 10px;font-size:10px">${dr.device.name} — ${dr.device.category.replace('_',' ')}</td>
    </tr>`;
  }).join('');

  // ── Pages 2+: One per device ────────────────────────────────────────────────
  const devicePages = deviceReports.map((dr, idx) => {
    const { device, readings } = dr;
    const code = makeAbbrev(device.name, idx);
    const tempGraph = buildTempGraph(readings, device.temp_high_threshold, device.temp_low_threshold);
    const humGraph  = buildHumGraph(readings);

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

    const graphLegend = (color: string, label: string, dashed = false) =>
      `<span style="display:flex;align-items:center;gap:4px">
        <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="${color}" stroke-width="${dashed ? 1.5 : 2}"${dashed ? ' stroke-dasharray="4,3"' : ''}/></svg>
        ${label}
      </span>`;

    return `
    <div style="page-break-before:always">
      <div style="background:#0097A7;height:6px;margin:-20px -24px 14px"></div>
      <p style="font-size:10px;font-weight:bold;margin:0 0 10px;color:#1C1C1E">
        ${code} ${device.name}. Device ID: ${device.mac_address}.
      </p>

      <!-- Temperature graph -->
      <p style="font-size:9px;font-weight:bold;color:#374151;margin:0 0 4px">Temperature (°C)</p>
      <div style="border:1px solid #E5E7EB;padding:8px;margin-bottom:6px;background:#fff">
        ${tempGraph}
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:6px;font-size:9px;color:#6B7280">
          ${graphLegend('#22C55E', `temperature (${code})`)}
          ${graphLegend('#EF4444', 'high threshold', true)}
          ${graphLegend('#3B82F6', 'low threshold', true)}
        </div>
      </div>

      <!-- Humidity graph -->
      ${humGraph ? `
      <p style="font-size:9px;font-weight:bold;color:#374151;margin:0 0 4px">Humidity (%)</p>
      <div style="border:1px solid #E5E7EB;padding:8px;margin-bottom:10px;background:#fff">
        ${humGraph}
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:6px;font-size:9px;color:#6B7280">
          ${graphLegend('#06B6D4', `humidity (${code})`)}
        </div>
      </div>` : ''}

      <!-- Data table -->
      <table style="width:100%;border-collapse:collapse;font-size:8.5px">
        <thead>
          <tr style="background:#5C6BC0;color:#fff">
            <th style="padding:5px 6px;text-align:left;min-width:120px">Date</th>
            <th style="padding:5px 4px;text-align:center">humidity<br/>${code}<br/>min</th>
            <th style="padding:5px 4px;text-align:center">humidity<br/>${code}<br/>max</th>
            <th style="padding:5px 4px;text-align:center">humidity<br/>${code}<br/>mean</th>
            <th style="padding:5px 4px;text-align:center">temperature<br/>${code}<br/>min</th>
            <th style="padding:5px 4px;text-align:center">temperature<br/>${code}<br/>max</th>
            <th style="padding:5px 4px;text-align:center">temperature<br/>${code}<br/>mean</th>
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
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1C1C1E; padding: 20px 24px; }
    @page { margin: 12mm 15mm; }
    .top-bar { background: #0097A7; height: 8px; margin: -20px -24px 16px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid #E5E7EB; }
    .report-title { text-align: center; font-size: 15px; font-weight: bold; margin: 10px 0 6px; }
    .meta { font-size: 10px; color: #374151; margin-bottom: 3px; }
    .legend-box { border: 1px solid #E5E7EB; padding: 14px; margin-top: 14px; background: #FAFBFF; }
    .legend-title { font-weight: bold; text-align: center; margin-bottom: 10px; font-size: 12px; }
    table { border-collapse: collapse; }
    th, td { text-align: left; }
  </style>
</head>
<body>
  <div class="top-bar"></div>
  <div class="page-header">
    ${logoHtml}
    ${logoHtml}
  </div>
  <div class="report-title">${reportTitle}</div>
  <div class="meta">Hour and date: ${generatedAt}</div>
  <div class="meta">Period: ${periodStr}</div>
  <div class="meta">Aggregate: ${aggregateLabel}</div>
  <div class="legend-box">
    <div class="legend-title">Legend</div>
    <p style="font-size:10px;color:#6B7280;margin-bottom:10px">Legend.</p>
    <div style="border:1px solid #E5E7EB;padding:14px;display:inline-block;min-width:320px;background:#fff">
      <table><tbody>${legendRows}</tbody></table>
    </div>
  </div>
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
  aggregateLabel: string = 'Daily',
): Promise<string> {
  const now = new Date();
  const monthName = now.toLocaleString('en', { month: 'long' });
  const title = `Kumva Insights ${monthName} Report`;

  const html = buildFullReportHtml(deviceReports, startDate, endDate, categoryLabel, title, aggregateLabel);
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

  const rawBuf = await wb.xlsx.writeBuffer();
  const u8 = new Uint8Array(rawBuf as ArrayBuffer);
  let bin = ''; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  const base64   = btoa(bin);
  const filename = `kumva_report_${ts()}.xlsx`;
  const cacheUri = `${LegacyFS.cacheDirectory}${filename}`;
  await LegacyFS.writeAsStringAsync(cacheUri, base64, { encoding: LegacyFS.EncodingType.Base64 });
  return saveFile(cacheUri, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/**
 * Full single-sheet Excel report — all devices stacked one below another.
 */
export async function exportFullReportExcel(
  deviceReports: DeviceReport[],
  startDate: number,
  endDate: number,
  categoryLabel: string,
  aggregateLabel: string = 'Daily',
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kumva Insights';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Report');

  // Column widths
  sheet.getColumn(1).width = 22; // Date & Time
  sheet.getColumn(2).width = 16; // Humidity Min
  sheet.getColumn(3).width = 16; // Humidity Max
  sheet.getColumn(4).width = 16; // Humidity Mean
  sheet.getColumn(5).width = 14; // Temp Min
  sheet.getColumn(6).width = 14; // Temp Max
  sheet.getColumn(7).width = 14; // Temp Mean

  // ── Logo ──────────────────────────────────────────────────────────────────
  const logoB64 = getLogoBase64();
  let currentRow = 1;
  if (logoB64) {
    try {
      const imageId = wb.addImage({ base64: logoB64, extension: 'png' });
      sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 160, height: 60 } });
      sheet.getRow(1).height = 20;
      sheet.getRow(2).height = 20;
      sheet.getRow(3).height = 20;
      currentRow = 4;
    } catch (e) {
      console.warn('[Export] Could not embed logo in Excel', e);
    }
  }

  // ── Report metadata ────────────────────────────────────────────────────────
  const titleCell = sheet.getCell(`A${currentRow}`);
  titleCell.value = 'Kumva Insights Report';
  titleCell.font  = { bold: true, size: 14, color: { argb: 'FF5C6BC0' } };
  currentRow++;

  sheet.getCell(`A${currentRow}`).value = `Category: ${categoryLabel}   |   Period: ${fmtDate(startDate)} to ${fmtDate(endDate)}   |   Aggregate: ${aggregateLabel}`;
  sheet.getCell(`A${currentRow}`).font  = { size: 10, color: { argb: 'FF374151' } };
  currentRow++;

  sheet.getCell(`A${currentRow}`).value = `Generated: ${fmtDT(Date.now())}`;
  sheet.getCell(`A${currentRow}`).font  = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
  currentRow += 2; // blank row after metadata

  // ── Legend ─────────────────────────────────────────────────────────────────
  const legendTitleCell = sheet.getCell(`A${currentRow}`);
  legendTitleCell.value = 'Legend';
  legendTitleCell.font  = { bold: true, size: 11 };
  currentRow++;

  deviceReports.forEach((dr, idx) => {
    const code = makeAbbrev(dr.device.name, idx);
    const codeCell = sheet.getCell(`A${currentRow}`);
    const nameCell = sheet.getCell(`B${currentRow}`);
    codeCell.value = code;
    codeCell.font  = { bold: true, size: 10 };
    nameCell.value = `${dr.device.name} — ${dr.device.category.replace('_', ' ')}`;
    nameCell.font  = { size: 10 };
    currentRow++;
  });
  currentRow++; // blank row after legend

  // ── Data: all devices stacked ──────────────────────────────────────────────
  const COL_HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF5C6BC0' } };
  const COL_HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
  const DEVICE_TITLE_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEEF0FB' } };

  deviceReports.forEach((dr, idx) => {
    const { device, readings } = dr;
    const code = makeAbbrev(device.name, idx);

    // Device title row
    const deviceTitleCell = sheet.getCell(`A${currentRow}`);
    deviceTitleCell.value = `${code}  ${device.name}  —  MAC: ${device.mac_address}  —  Category: ${device.category.replace('_', ' ')}`;
    deviceTitleCell.font  = { bold: true, size: 10, color: { argb: 'FF1C1C1E' } };
    deviceTitleCell.fill  = DEVICE_TITLE_FILL;
    sheet.mergeCells(`A${currentRow}:G${currentRow}`);
    sheet.getRow(currentRow).height = 16;
    currentRow++;

    // Column headers
    const headers = [
      `Date & Time`,
      `Humidity ${code} min (%)`,
      `Humidity ${code} max (%)`,
      `Humidity ${code} mean (%)`,
      `Temp ${code} min (°C)`,
      `Temp ${code} max (°C)`,
      `Temp ${code} mean (°C)`,
    ];
    const headerRow = sheet.getRow(currentRow);
    headers.forEach((h, ci) => {
      const cell = headerRow.getCell(ci + 1);
      cell.value = h;
      cell.font  = COL_HEADER_FONT;
      cell.fill  = COL_HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = 28;
    currentRow++;

    // Data rows
    readings.forEach((r, i) => {
      const dataRow = sheet.getRow(currentRow);
      dataRow.getCell(1).value = fmtDT(r.timestamp);
      dataRow.getCell(2).value = r.humidity != null ? +r.humidity.toFixed(2) : null;
      dataRow.getCell(3).value = r.humidity != null ? +r.humidity.toFixed(2) : null;
      dataRow.getCell(4).value = r.humidity != null ? +r.humidity.toFixed(2) : null;
      dataRow.getCell(5).value = +r.temperature.toFixed(2);
      dataRow.getCell(6).value = +r.temperature.toFixed(2);
      dataRow.getCell(7).value = +r.temperature.toFixed(2);
      if (i % 2 === 1) {
        dataRow.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FF' } };
        });
      }
      currentRow++;
    });

    currentRow += 2; // blank rows between devices
  });

  const rawBuffer = await wb.xlsx.writeBuffer();
  const uint8 = new Uint8Array(rawBuffer as ArrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  const base64   = btoa(binary);
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
