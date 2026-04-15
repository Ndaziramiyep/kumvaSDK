import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Platform, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/store';
import { DeviceCategory } from '../../types/device';
import { getAllReports, insertReport } from '../../database/repositories/reportRepository';
import { getReadingsByDevice } from '../../database/repositories/readingRepository';

type TimeRange = 'Week' | 'Month' | 'Custom';

const CATEGORY_OPTIONS: { label: string; value: DeviceCategory | 'all' }[] = [
  { label: 'All Categories', value: 'all' },
  { label: 'Freezer', value: 'freezer' },
  { label: 'Fridge', value: 'fridge' },
  { label: 'Cold Room', value: 'cold_room' },
  { label: 'General Area', value: 'general' },
];

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function addDays(ts: number, days: number): number {
  return ts + days * 86400000;
}

// Simple inline date picker (year/month/day wheels not available without library — use modal with calendar grid)
function DatePickerModal({
  visible, value, onConfirm, onCancel,
}: {
  visible: boolean;
  value: number;
  onConfirm: (ts: number) => void;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState(new Date(value));
  const year = current.getFullYear();
  const month = current.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const prevMonth = () => setCurrent(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrent(new Date(year, month + 1, 1));

  const selectDay = (day: number) => {
    onConfirm(new Date(year, month, day).getTime());
  };

  const selectedDay = new Date(value).getDate();
  const isCurrentMonth =
    new Date(value).getFullYear() === year && new Date(value).getMonth() === month;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={dp.overlay}>
        <View style={dp.container}>
          <View style={dp.header}>
            <TouchableOpacity onPress={prevMonth}><Text style={dp.arrow}>‹</Text></TouchableOpacity>
            <Text style={dp.monthYear}>{MONTHS[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth}><Text style={dp.arrow}>›</Text></TouchableOpacity>
          </View>
          <View style={dp.weekRow}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <Text key={d} style={dp.weekDay}>{d}</Text>
            ))}
          </View>
          <View style={dp.grid}>
            {cells.map((day, i) => (
              <TouchableOpacity
                key={i}
                style={[dp.cell, day && isCurrentMonth && day === selectedDay && dp.cellSelected]}
                onPress={() => day && selectDay(day)}
                disabled={!day}
              >
                <Text style={[dp.cellText, day && isCurrentMonth && day === selectedDay && dp.cellTextSelected]}>
                  {day ?? ''}
                </Text>
              </TouchableOpacity>
            ))}
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

const SAMPLE_REPORT_ROWS = [
  { device: 'Main Freezer 01',  category: 'freezer',   temperature: -4.2,  humidity: 68, timestamp: formatDate(Date.now() - 1 * 86400000) },
  { device: 'Main Freezer 01',  category: 'freezer',   temperature: -3.8,  humidity: 70, timestamp: formatDate(Date.now() - 2 * 86400000) },
  { device: 'Fridge Unit A',    category: 'fridge',    temperature:  4.1,  humidity: 55, timestamp: formatDate(Date.now() - 1 * 86400000) },
  { device: 'Fridge Unit A',    category: 'fridge',    temperature:  5.3,  humidity: 57, timestamp: formatDate(Date.now() - 2 * 86400000) },
  { device: 'Cold Room North',  category: 'cold_room', temperature:  2.7,  humidity: 72, timestamp: formatDate(Date.now() - 1 * 86400000) },
  { device: 'Cold Room North',  category: 'cold_room', temperature:  3.1,  humidity: 74, timestamp: formatDate(Date.now() - 3 * 86400000) },
  { device: 'General Store B',  category: 'general',   temperature: 18.5,  humidity: 45, timestamp: formatDate(Date.now() - 2 * 86400000) },
  { device: 'Freezer Unit 02',  category: 'freezer',   temperature: -5.1,  humidity: 66, timestamp: formatDate(Date.now() - 4 * 86400000) },
];

export default function ReportsScreen() {
  const devices = useAppStore(s => s.devices);

  const [category, setCategory] = useState<DeviceCategory | 'all'>('all');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('Week');
  const [startDate, setStartDate] = useState(() => addDays(Date.now(), -7));
  const [endDate, setEndDate] = useState(() => Date.now());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportRows, setReportRows] = useState<any[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  const selectedCategoryLabel = CATEGORY_OPTIONS.find(o => o.value === category)?.label ?? 'All Categories';

  const applyTimeRange = (range: TimeRange) => {
    setTimeRange(range);
    const now = Date.now();
    if (range === 'Week') { setStartDate(addDays(now, -7)); setEndDate(now); }
    if (range === 'Month') { setStartDate(addDays(now, -30)); setEndDate(now); }
  };

  const filteredDevices = category === 'all'
    ? devices
    : devices.filter(d => d.category === category);

  const generateReport = async () => {
    setExporting(true);
    try {
      const rows: any[] = [];
      for (const device of filteredDevices) {
        const readings = await getReadingsByDevice(device.device_id, 1000);
        const filtered = readings.filter(r => r.timestamp >= startDate && r.timestamp <= endDate);
        filtered.forEach(r => rows.push({
          device: device.name,
          mac: device.mac_address,
          category: device.category,
          temperature: r.temperature,
          humidity: r.humidity ?? '--',
          timestamp: formatDate(r.timestamp),
        }));
      }
      setReportRows(rows);
      setHasGenerated(true);

      // Save report metadata to DB
      await insertReport({
        filter_categories: category === 'all' ? null : category,
        time_range_start: startDate,
        time_range_end: endDate,
        file_url: null,
        generated: Date.now(),
      }).catch(console.error);
    } catch (e) {
      Alert.alert('Error', 'Failed to generate report.');
    } finally {
      setExporting(false);
    }
  };

  const exportAs = async (format: 'PDF' | 'Excel') => {
    if (!hasGenerated) {
      await generateReport();
    }
    if (reportRows.length === 0) {
      Alert.alert('No Data', 'No readings found for the selected filters and date range.');
      return;
    }
    try {
      // For demo, export as PDF or Excel
      const html = `
        <html>
          <body>
            <h1>Report</h1>
            <table border="1">
              <tr><th>Device</th><th>Category</th><th>Temperature</th><th>Humidity</th><th>Timestamp</th></tr>
              ${reportRows.map(r => `<tr><td>${r.device}</td><td>${r.category}</td><td>${r.temperature}</td><td>${r.humidity}</td><td>${r.timestamp}</td></tr>`).join('')}
            </table>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      Alert.alert('Export Successful', `File saved at ${uri}`);
    } catch (error) {
      Alert.alert('Export Failed', 'Could not export report.');
    }
  };

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
          <Text style={styles.chevron}>{showCategoryPicker ? '▲' : '▼'}</Text>
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

        {/* Date inputs */}
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>START DATE</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => setShowStartPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color="#9CA3AF" />
              <Text style={styles.dateText}>{formatDate(startDate)}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>END DATE</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => setShowEndPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color="#9CA3AF" />
              <Text style={styles.dateText}>{formatDate(endDate)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Preview area */}
        <TouchableOpacity style={styles.previewBox} onPress={generateReport} activeOpacity={0.8}>
          {!hasGenerated ? (
            <>
              <View style={styles.previewSampleHeader}>
                <Text style={styles.previewSummaryTitle}>Report Preview</Text>
                <View style={styles.sampleBadge}>
                  <Text style={styles.sampleBadgeText}>SAMPLE DATA</Text>
                </View>
              </View>
              <Text style={styles.previewSummaryCount}>{SAMPLE_REPORT_ROWS.length} reading(s)</Text>
              <Text style={styles.previewSummaryRange}>Tap to generate with your filters</Text>
              <View style={styles.previewTable}>
                <View style={styles.previewTableHeader}>
                  <Text style={[styles.previewCell, styles.previewCellHead]}>Device</Text>
                  <Text style={[styles.previewCell, styles.previewCellHead]}>Temp</Text>
                  <Text style={[styles.previewCell, styles.previewCellHead]}>Humidity</Text>
                  <Text style={[styles.previewCell, styles.previewCellHead]}>Date</Text>
                </View>
                {SAMPLE_REPORT_ROWS.slice(0, 6).map((row, i) => (
                  <View key={i} style={[styles.previewTableRow, i % 2 === 0 && styles.previewTableRowAlt]}>
                    <Text style={styles.previewCell} numberOfLines={1}>{row.device}</Text>
                    <Text style={styles.previewCell}>{row.temperature}°C</Text>
                    <Text style={styles.previewCell}>{row.humidity}%</Text>
                    <Text style={styles.previewCell}>{row.timestamp}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : reportRows.length === 0 ? (
            <>
              <Ionicons name="mail-open-outline" size={36} color="#D1D5DB" />
              <Text style={styles.previewText}>No readings found for the selected{'\n'}filters and date range.</Text>
            </>
          ) : (
            <>
              <Text style={styles.previewSummaryTitle}>Report Preview</Text>
              <Text style={styles.previewSummaryCount}>{reportRows.length} reading(s)</Text>
              <Text style={styles.previewSummaryRange}>{formatDate(startDate)} → {formatDate(endDate)}</Text>
              <View style={styles.previewTable}>
                <View style={styles.previewTableHeader}>
                  <Text style={[styles.previewCell, styles.previewCellHead]}>Device</Text>
                  <Text style={[styles.previewCell, styles.previewCellHead]}>Temp</Text>
                  <Text style={[styles.previewCell, styles.previewCellHead]}>Humidity</Text>
                  <Text style={[styles.previewCell, styles.previewCellHead]}>Date</Text>
                </View>
                {reportRows.slice(0, 6).map((row, i) => (
                  <View key={i} style={[styles.previewTableRow, i % 2 === 0 && styles.previewTableRowAlt]}>
                    <Text style={styles.previewCell} numberOfLines={1}>{row.device}</Text>
                    <Text style={styles.previewCell}>{row.temperature}°C</Text>
                    <Text style={styles.previewCell}>{row.humidity}%</Text>
                    <Text style={styles.previewCell}>{row.timestamp}</Text>
                  </View>
                ))}
                {reportRows.length > 6 && (
                  <Text style={styles.previewMore}>+{reportRows.length - 6} more rows</Text>
                )}
              </View>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* Export buttons */}
      <View style={styles.exportRow}>
        <TouchableOpacity style={styles.exportBtn} onPress={() => exportAs('PDF')} activeOpacity={0.85}>
          <Ionicons name="document-text-outline" size={18} color="#fff" />
          <Text style={styles.exportText}>Export PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.exportBtn, styles.exportBtnSecondary]} onPress={() => exportAs('Excel')} activeOpacity={0.85}>
          <Ionicons name="grid-outline" size={18} color="#fff" />
          <Text style={styles.exportText}>Export Excel</Text>
        </TouchableOpacity>
      </View>

      {/* Date pickers */}
      <DatePickerModal
        visible={showStartPicker}
        value={startDate}
        onConfirm={ts => { setStartDate(ts); setShowStartPicker(false); setTimeRange('Custom'); setHasGenerated(false); }}
        onCancel={() => setShowStartPicker(false)}
      />
      <DatePickerModal
        visible={showEndPicker}
        value={endDate}
        onConfirm={ts => { setEndDate(ts); setShowEndPicker(false); setTimeRange('Custom'); setHasGenerated(false); }}
        onCancel={() => setShowEndPicker(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6FB' },
  header: {
    paddingVertical: 14, paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },

  body: { padding: 20, gap: 14, paddingBottom: 24 },

  label: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },

  select: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 13,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  selectText: { fontSize: 15, color: '#1C1C1E' },
  chevron: { fontSize: 12, color: '#9CA3AF' },
  dropdown: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#E5E7EB', overflow: 'hidden', marginTop: -10,
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemActive: { backgroundColor: '#EEF0FB' },
  dropdownText: { fontSize: 15, color: '#1C1C1E' },
  dropdownTextActive: { color: '#5C6BC0', fontWeight: '600' },

  tabRow: {
    flexDirection: 'row', backgroundColor: '#F0F2FA',
    borderRadius: 10, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  tabTextActive: { color: '#1C1C1E', fontWeight: '700' },

  dateRow: { flexDirection: 'row', gap: 12 },
  dateCol: { flex: 1, gap: 6 },
  dateLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8 },
  dateInput: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  dateText: { fontSize: 14, color: '#1C1C1E' },

  previewBox: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    padding: 16, gap: 6,
  },
  previewSampleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  sampleBadge: { backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sampleBadgeText: { fontSize: 10, fontWeight: '700', color: '#D97706', letterSpacing: 0.5 },
  previewText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  previewSummaryTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  previewSummaryCount: { fontSize: 22, fontWeight: '800', color: '#5C6BC0' },
  previewSummaryRange: { fontSize: 12, color: '#9CA3AF', marginBottom: 8 },
  previewTable: { width: '100%', gap: 2 },
  previewTableHeader: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  previewTableRow: { flexDirection: 'row', paddingVertical: 5 },
  previewTableRowAlt: { backgroundColor: '#F8F9FF', borderRadius: 4 },
  previewCell: { flex: 1, fontSize: 11, color: '#4B5563' },
  previewCellHead: { fontWeight: '700', color: '#1C1C1E', fontSize: 11 },
  previewMore: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },

  exportRow: {
    flexDirection: 'row', gap: 12, padding: 16,
    backgroundColor: '#F4F6FB',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E0E0E0',
  },
  exportBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#5C6BC0', borderRadius: 14, paddingVertical: 16,
    shadowColor: '#5C6BC0', shadowOpacity: 0.3, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  exportBtnSecondary: { backgroundColor: '#7C3AED' },
  exportText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// Date picker modal styles
const dp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: 320 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  arrow: { fontSize: 24, color: '#5C6BC0', paddingHorizontal: 8 },
  monthYear: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  cellSelected: { backgroundColor: '#5C6BC0' },
  cellText: { fontSize: 13, color: '#1C1C1E' },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelText: { fontSize: 14, color: '#9CA3AF' },
  confirmBtn: { backgroundColor: '#5C6BC0', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  confirmText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
