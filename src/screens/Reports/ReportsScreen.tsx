import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/store';
import { DeviceCategory } from '../../types/device';
import { Reading } from '../../types/reading';
import { insertReport } from '../../database/repositories/reportRepository';
import { getReadingsByDateRange } from '../../database/repositories/readingRepository';
import { exportFullReportPdf, exportFullReportExcel, DeviceReport } from '../../services/exportService';

type TimeRange  = 'Week' | 'Month' | 'Custom';
type Aggregate  = 'Daily' | 'Hourly' | 'Minute';

const AGGREGATE_OPTIONS: { label: string; value: Aggregate; intervalMs: number }[] = [
  { label: 'Daily',   value: 'Daily',   intervalMs: 86400000 },
  { label: 'Hourly',  value: 'Hourly',  intervalMs: 3600000  },
  { label: 'Minute',  value: 'Minute',  intervalMs: 60000    },
];

const CATEGORY_OPTIONS: { label: string; value: DeviceCategory | 'all' }[] = [
  { label: 'All Categories', value: 'all' },
  { label: 'Freezer',        value: 'freezer' },
  { label: 'Fridge',         value: 'fridge' },
  { label: 'Cold Room',      value: 'cold_room' },
  { label: 'General Area',   value: 'general' },
];

const THREE_MONTHS_AGO = (() => {
  const d = new Date(); d.setMonth(d.getMonth() - 3); d.setHours(0, 0, 0, 0); return d.getTime();
})();
const TODAY_END = (() => {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime();
})();

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Date Picker ───────────────────────────────────────────────────────────────
function DatePickerModal({ visible, value, onConfirm, onCancel, minDate, maxDate }: {
  visible: boolean; value: number;
  onConfirm: (ts: number) => void; onCancel: () => void;
  minDate: number; maxDate: number;
}) {
  const [current, setCurrent] = useState(new Date(value));
  const year = current.getFullYear();
  const month = current.getMonth();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const isDayDisabled = (day: number) => {
    const ts = new Date(year, month, day).getTime();
    return ts < minDate || ts > maxDate;
  };
  const canGoPrev = new Date(year, month - 1 + 1, 0).getTime() >= minDate;
  const canGoNext = new Date(year, month + 1, 1).getTime() <= maxDate;
  const selectedDay = new Date(value).getDate();
  const isCurrentMonth = new Date(value).getFullYear() === year && new Date(value).getMonth() === month;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={dp.overlay}>
        <View style={dp.container}>
          <View style={dp.header}>
            <TouchableOpacity onPress={() => canGoPrev && setCurrent(new Date(year, month - 1, 1))} disabled={!canGoPrev}>
              <Text style={[dp.arrow, !canGoPrev && dp.arrowDisabled]}>‹</Text>
            </TouchableOpacity>
            <Text style={dp.monthYear}>{MONTHS[month]} {year}</Text>
            <TouchableOpacity onPress={() => canGoNext && setCurrent(new Date(year, month + 1, 1))} disabled={!canGoNext}>
              <Text style={[dp.arrow, !canGoNext && dp.arrowDisabled]}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={dp.weekRow}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <Text key={d} style={dp.weekDay}>{d}</Text>)}
          </View>
          <View style={dp.grid}>
            {cells.map((day, i) => {
              const disabled = !day || isDayDisabled(day);
              const selected = !!day && isCurrentMonth && day === selectedDay;
              return (
                <TouchableOpacity
                  key={i}
                  style={[dp.cell, selected && dp.cellSelected, disabled && dp.cellDisabled]}
                  onPress={() => day && !disabled && onConfirm(new Date(year, month, day).getTime())}
                  disabled={disabled}
                >
                  <Text style={[dp.cellText, selected && dp.cellTextSelected, disabled && dp.cellTextDisabled]}>
                    {day ?? ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={dp.actions}>
            <TouchableOpacity onPress={onCancel} style={dp.cancelBtn}>
              <Text style={dp.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onConfirm(current.getTime())} style={dp.confirmBtn}>
              <Text style={dp.confirmText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const devices = useAppStore(s => s.devices);

  const [category, setCategory]               = useState<DeviceCategory | 'all'>('all');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [timeRange, setTimeRange]             = useState<TimeRange>('Week');
  const [startDate, setStartDate]             = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0); return d.getTime(); });
  const [endDate, setEndDate]                 = useState(TODAY_END);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker]     = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [exporting, setExporting]             = useState(false);
  const [reportRows, setReportRows]           = useState<any[]>([]);
  const [deviceReports, setDeviceReports]     = useState<DeviceReport[]>([]);
  const [generated, setGenerated]             = useState(false);
  const [aggregate, setAggregate]             = useState<Aggregate>('Daily');
  const [showAggregatePicker, setShowAggregatePicker] = useState(false);

  const selectedAggregateLabel = AGGREGATE_OPTIONS.find(o => o.value === aggregate)?.label ?? 'Daily';
  const aggregateIntervalMs    = AGGREGATE_OPTIONS.find(o => o.value === aggregate)?.intervalMs ?? 86400000;

  // ── Aggregate readings into buckets ────────────────────────────────────────
  const aggregateReadings = (readings: Reading[], intervalMs: number): Reading[] => {
    if (readings.length === 0) return [];
    const buckets = new Map<number, Reading[]>();
    readings.forEach(r => {
      const bucket = Math.floor(r.timestamp / intervalMs) * intervalMs;
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(r);
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([bucketTs, recs]) => ({
        device_id:   recs[0].device_id,
        timestamp:   bucketTs,
        temperature: recs.reduce((s, r) => s + r.temperature, 0) / recs.length,
        humidity:    recs.some(r => r.humidity != null)
          ? recs.filter(r => r.humidity != null).reduce((s, r) => s + r.humidity!, 0) /
            recs.filter(r => r.humidity != null).length
          : null,
      }));
  };

  const selectedCategoryLabel = CATEGORY_OPTIONS.find(o => o.value === category)?.label ?? 'All Categories';

  const filteredDevices = category === 'all'
    ? devices
    : devices.filter(d => d.category === category);

  // ── Generate report from real DB data ──────────────────────────────────────
  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const rows: any[] = [];
      const devReports: DeviceReport[] = [];
      for (const device of filteredDevices) {
        const rawReadings = await getReadingsByDateRange(device.device_id, startDate, endDate);
        const readings    = aggregateReadings(rawReadings, aggregateIntervalMs);
        devReports.push({ device, readings });
        readings.forEach(r => rows.push({
          device:      device.name,
          mac:         device.mac_address,
          category:    device.category,
          temperature: r.temperature,
          humidity:    r.humidity != null ? r.humidity : '--',
          timestamp:   formatDateTime(r.timestamp),
        }));
      }
      rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      setReportRows(rows);
      setDeviceReports(devReports);
      setGenerated(true);

      await insertReport({
        filter_categories: category === 'all' ? null : category,
        time_range_start:  startDate,
        time_range_end:    endDate,
        file_url:          null,
        generated:         Date.now(),
      }).catch(console.error);
    } catch (e) {
      Alert.alert('Error', 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  }, [filteredDevices, startDate, endDate, category, aggregateIntervalMs]);

  // Auto-generate when filters change
  useEffect(() => {
    setGenerated(false);
    setReportRows([]);
    setDeviceReports([]);
  }, [category, startDate, endDate, aggregate]);

  const applyTimeRange = (range: TimeRange) => {
    setTimeRange(range);
    const now = Date.now();
    if (range === 'Week')  { setStartDate(now - 7 * 86400000);  setEndDate(TODAY_END); }
    if (range === 'Month') { setStartDate(now - 30 * 86400000); setEndDate(TODAY_END); }
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportAs = async (format: 'PDF' | 'Excel') => {
    if (!generated) await generateReport();
    if (deviceReports.length === 0 || deviceReports.every(dr => dr.readings.length === 0)) {
      Alert.alert('No Data', 'No readings found for the selected filters and date range.');
      return;
    }
    setExporting(true);
    try {
      const uri = format === 'PDF'
        ? await exportFullReportPdf(deviceReports, startDate, endDate, selectedCategoryLabel, selectedAggregateLabel)
        : await exportFullReportExcel(deviceReports, startDate, endDate, selectedCategoryLabel, selectedAggregateLabel);
      Alert.alert('Export Successful', `Your ${format} report has been saved.\n\n${uri}`, [{ text: 'OK' }]);
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message || 'Could not export report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        <TouchableOpacity style={styles.select} onPress={() => setShowCategoryPicker(v => !v)} activeOpacity={0.8}>
          <Text style={styles.selectText}>{selectedCategoryLabel}</Text>
          <Ionicons name={showCategoryPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
        </TouchableOpacity>
        {showCategoryPicker && (
          <View style={styles.dropdown}>
            {CATEGORY_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.value}
                style={[styles.dropdownItem, o.value === category && styles.dropdownItemActive]}
                onPress={() => { setCategory(o.value); setShowCategoryPicker(false); }}
              >
                <Text style={[styles.dropdownText, o.value === category && styles.dropdownTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Time Selection */}
        <Text style={styles.label}>Time Selection</Text>
        <View style={styles.tabRow}>
          {(['Week', 'Month', 'Custom'] as TimeRange[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, timeRange === t && styles.tabActive]}
              onPress={() => applyTimeRange(t)}
            >
              <Text style={[styles.tabText, timeRange === t && styles.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date inputs — always visible */}
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>START DATE</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => setShowStartPicker(true)}>
              <Ionicons name="calendar-outline" size={15} color="#9CA3AF" />
              <Text style={styles.dateText}>{formatDate(startDate)}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>END DATE</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => setShowEndPicker(true)}>
              <Ionicons name="calendar-outline" size={15} color="#9CA3AF" />
              <Text style={styles.dateText}>{formatDate(endDate)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Aggregates */}
        <Text style={styles.label}>Aggregates</Text>
        <TouchableOpacity style={styles.select} onPress={() => setShowAggregatePicker(v => !v)} activeOpacity={0.8}>
          <Text style={styles.selectText}>{selectedAggregateLabel}</Text>
          <Ionicons name={showAggregatePicker ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
        </TouchableOpacity>
        {showAggregatePicker && (
          <View style={styles.dropdown}>
            {AGGREGATE_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.value}
                style={[styles.dropdownItem, o.value === aggregate && styles.dropdownItemActive]}
                onPress={() => { setAggregate(o.value); setShowAggregatePicker(false); }}
              >
                <View style={styles.aggregateRow}>
                  <Text style={[styles.dropdownText, o.value === aggregate && styles.dropdownTextActive]}>
                    {o.label}
                  </Text>
                  <Text style={styles.aggregateHint}>
                    {o.value === 'Daily'  ? 'One record per day'    :
                     o.value === 'Hourly' ? 'One record per hour'   :
                                           'One record per minute'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Preview area — tap to generate */}
        <TouchableOpacity
          style={[styles.previewBox, loading && { opacity: 0.7 }]}
          onPress={generateReport}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <View style={styles.loadingPreview}>
              <ActivityIndicator color="#5C6BC0" size="large" />
              <Text style={styles.loadingText}>Generating report...</Text>
            </View>
          ) : !generated ? (
            <View style={styles.emptyPreview}>
              <Ionicons name="document-text-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyPreviewTitle}>Tap to generate report</Text>
              <Text style={styles.emptyPreviewText}>
                {selectedCategoryLabel} · {formatDate(startDate)} → {formatDate(endDate)}
              </Text>
            </View>
          ) : reportRows.length === 0 ? (
            <View style={styles.emptyPreview}>
              <Ionicons name="mail-open-outline" size={36} color="#D1D5DB" />
              <Text style={styles.emptyPreviewText}>
                No readings found for{'\n'}{selectedCategoryLabel} · {formatDate(startDate)} → {formatDate(endDate)}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.previewMeta}>
                <Text style={styles.previewTitle}>Report Preview</Text>
                <Text style={styles.previewCount}>{reportRows.length} reading{reportRows.length !== 1 ? 's' : ''}</Text>
                <Text style={styles.previewRange}>{formatDate(startDate)} → {formatDate(endDate)}</Text>
              </View>

              <View style={styles.tableHead}>
                <Text style={[styles.th, { flex: 2 }]}>Device</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>Temp</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>Hum</Text>
                <Text style={[styles.th, { flex: 2 }]}>Date & Time</Text>
              </View>

              {reportRows.slice(0, 8).map((row, i) => (
                <View key={i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{row.device}</Text>
                  <Text style={[styles.td, { flex: 1.2 }]}>{row.temperature}°</Text>
                  <Text style={[styles.td, { flex: 1.2 }]}>{row.humidity !== '--' ? `${row.humidity}%` : '--'}</Text>
                  <Text style={[styles.td, { flex: 2 }]} numberOfLines={2}>{row.timestamp}</Text>
                </View>
              ))}
              {reportRows.length > 8 && (
                <Text style={styles.moreRows}>+{reportRows.length - 8} more rows</Text>
              )}
            </>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* Export buttons */}
      <View style={styles.exportRow}>
        <TouchableOpacity
          style={[styles.exportBtn, (exporting || loading) && { opacity: 0.6 }]}
          onPress={() => exportAs('PDF')}
          disabled={exporting || loading}
          activeOpacity={0.85}
        >
          <Ionicons name="document-text-outline" size={18} color="#fff" />
          <Text style={styles.exportText}>{exporting ? 'Exporting...' : 'Export PDF'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnSecondary, (exporting || loading) && { opacity: 0.6 }]}
          onPress={() => exportAs('Excel')}
          disabled={exporting || loading}
          activeOpacity={0.85}
        >
          <Ionicons name="grid-outline" size={18} color="#fff" />
          <Text style={styles.exportText}>Export Excel</Text>
        </TouchableOpacity>
      </View>

      {/* Date pickers */}
      <DatePickerModal
        visible={showStartPicker}
        value={startDate}
        minDate={THREE_MONTHS_AGO}
        maxDate={endDate}
        onConfirm={ts => { setStartDate(ts); setShowStartPicker(false); setTimeRange('Custom'); }}
        onCancel={() => setShowStartPicker(false)}
      />
      <DatePickerModal
        visible={showEndPicker}
        value={endDate}
        minDate={startDate}
        maxDate={TODAY_END}
        onConfirm={ts => { setEndDate(ts); setShowEndPicker(false); setTimeRange('Custom'); }}
        onCancel={() => setShowEndPicker(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#F4F6FB' },
  header:      { paddingVertical: 14, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  body:        { padding: 20, gap: 14, paddingBottom: 24 },

  label: { fontSize: 13, fontWeight: '600', color: '#374151' },

  select: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectText: { fontSize: 15, color: '#1C1C1E' },
  dropdown: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', marginTop: -10 },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemActive: { backgroundColor: '#EEF0FB' },
  dropdownText: { fontSize: 15, color: '#1C1C1E' },
  dropdownTextActive: { color: '#5C6BC0', fontWeight: '600' },
  aggregateRow:  { flex: 1 },
  aggregateHint: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  tabRow: { flexDirection: 'row', backgroundColor: '#F0F2FA', borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  tabTextActive: { color: '#1C1C1E', fontWeight: '700' },

  dateRow:   { flexDirection: 'row', gap: 12 },
  dateCol:   { flex: 1, gap: 6 },
  dateLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8 },
  dateInput: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText:  { fontSize: 13, color: '#1C1C1E' },

  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5C6BC0', borderRadius: 14, paddingVertical: 15, shadowColor: '#5C6BC0', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  generateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  previewBox: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    overflow: 'hidden', minHeight: 120,
  },
  loadingPreview:    { padding: 40, alignItems: 'center', gap: 12 },
  loadingText:       { fontSize: 13, color: '#9CA3AF' },
  emptyPreviewTitle: { fontSize: 14, fontWeight: '700', color: '#374151' },
  previewMeta: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F2FA' },
  previewTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  previewCount: { fontSize: 24, fontWeight: '800', color: '#5C6BC0', marginTop: 2 },
  previewRange: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  emptyPreview: { padding: 32, alignItems: 'center', gap: 10 },
  emptyPreviewText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  moreRows: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', padding: 10 },

  tableHead: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F8F9FF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  th: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 0.4 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  tableRowAlt: { backgroundColor: '#FAFBFF' },
  td: { fontSize: 12, color: '#1C1C1E', lineHeight: 17 },

  exportRow: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#F4F6FB', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E0E0E0' },
  exportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5C6BC0', borderRadius: 14, paddingVertical: 16, shadowColor: '#5C6BC0', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  exportBtnSecondary: { backgroundColor: '#7C3AED' },
  exportText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const dp = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  container:        { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: 320 },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  arrow:            { fontSize: 24, color: '#5C6BC0', paddingHorizontal: 8 },
  arrowDisabled:    { opacity: 0.25 },
  monthYear:        { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  weekRow:          { flexDirection: 'row', marginBottom: 8 },
  weekDay:          { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  grid:             { flexDirection: 'row', flexWrap: 'wrap' },
  cell:             { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  cellSelected:     { backgroundColor: '#5C6BC0' },
  cellDisabled:     { opacity: 0.25 },
  cellText:         { fontSize: 13, color: '#1C1C1E' },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
  cellTextDisabled: { color: '#9CA3AF' },
  actions:          { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  cancelBtn:        { paddingHorizontal: 16, paddingVertical: 8 },
  cancelText:       { fontSize: 14, color: '#9CA3AF' },
  confirmBtn:       { backgroundColor: '#5C6BC0', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  confirmText:      { fontSize: 14, color: '#fff', fontWeight: '700' },
});
