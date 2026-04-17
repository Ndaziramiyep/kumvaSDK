import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAllIncidents } from '../../database/repositories/incidentRepository';
import { useAppStore } from '../../store/store';
import { Incident } from '../../types/incident';
import { Device, DeviceCategory } from '../../types/device';
import { exportReportPdf, exportReportExcel } from '../../services/exportService';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + '\n'
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(start: number, end?: number | null): string {
  if (!end) return 'Ongoing';
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function catLabel(cat: string): string {
  return ({ freezer: 'Freezer', fridge: 'Fridge', cold_room: 'Cold Room', general: 'General' } as any)[cat] ?? cat;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const THREE_MONTHS_AGO = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); d.setHours(0,0,0,0); return d.getTime(); })();
const TODAY_END        = (() => { const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); })();

const CATEGORY_OPTIONS: { label: string; value: DeviceCategory | 'all' }[] = [
  { label: 'All Categories', value: 'all' },
  { label: 'Freezer',        value: 'freezer' },
  { label: 'Fridge',         value: 'fridge' },
  { label: 'Cold Room',      value: 'cold_room' },
  { label: 'General',        value: 'general' },
];

type TimeRange = 'Week' | 'Month' | 'Custom';

// ── Date Picker ───────────────────────────────────────────────────────────────
function DatePickerModal({ visible, value, minDate, maxDate, onConfirm, onCancel }: {
  visible: boolean; value: number; minDate: number; maxDate: number;
  onConfirm: (ts: number) => void; onCancel: () => void;
}) {
  const [current, setCurrent] = useState(new Date(value));
  const year = current.getFullYear();
  const month = current.getMonth();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const isDayDisabled = (day: number) => { const ts = new Date(year, month, day).getTime(); return ts < minDate || ts > maxDate; };
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
                <TouchableOpacity key={i} style={[dp.cell, selected && dp.cellSelected, disabled && dp.cellDisabled]}
                  onPress={() => day && !disabled && onConfirm(new Date(year, month, day).getTime())} disabled={disabled}>
                  <Text style={[dp.cellText, selected && dp.cellTextSelected, disabled && dp.cellTextDisabled]}>{day ?? ''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={dp.actions}>
            <TouchableOpacity onPress={onCancel} style={dp.cancelBtn}><Text style={dp.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Row type ──────────────────────────────────────────────────────────────────
type Row = Incident & { deviceName: string; deviceCategory: string };

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function IncidentsScreen() {
  const devices = useAppStore((s: any) => s.devices);
  const [allIncidents, setAllIncidents] = useState<Row[]>([]);
  const [loading, setLoading]           = useState(true);
  const [exporting, setExporting]       = useState(false);

  const [category, setCategory]                     = useState<DeviceCategory | 'all'>('all');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [timeRange, setTimeRange]                   = useState<TimeRange>('Week');
  const [startDate, setStartDate]                   = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0); return d.getTime(); });
  const [endDate, setEndDate]                       = useState(TODAY_END);
  const [showStartPicker, setShowStartPicker]       = useState(false);
  const [showEndPicker, setShowEndPicker]           = useState(false);

  // ── Load incidents from DB ─────────────────────────────────────────────────
  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllIncidents();
      const deviceMap = new Map<string, Device>(devices.map((d: Device) => [d.device_id, d]));
      const rows: Row[] = data.map(inc => {
        const dev = deviceMap.get(inc.device_id);
        return {
          ...inc,
          // Prefer stored device_name/device_category (set at incident creation time)
          deviceName:     (inc as any).device_name || dev?.name     || inc.device_id,
          deviceCategory: (inc as any).device_category || dev?.category || '',
        };
      });
      setAllIncidents(rows);
    } catch (e) {
      console.error('[Incidents] load error', e);
    } finally {
      setLoading(false);
    }
  }, [devices]);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  const applyTimeRange = (range: TimeRange) => {
    setTimeRange(range);
    const now = Date.now();
    if (range === 'Week')  { setStartDate(now - 7 * 86400000);  setEndDate(TODAY_END); }
    if (range === 'Month') { setStartDate(now - 30 * 86400000); setEndDate(TODAY_END); }
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => allIncidents.filter(r => {
    const matchCat  = category === 'all' || r.deviceCategory === category;
    const matchDate = r.start_time >= startDate && r.start_time <= endDate;
    return matchCat && matchDate;
  }), [allIncidents, category, startDate, endDate]);

  const selectedCategoryLabel = CATEGORY_OPTIONS.find(o => o.value === category)?.label ?? 'All Categories';

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportAs = async (format: 'PDF' | 'Excel') => {
    if (filtered.length === 0) {
      Alert.alert('No Data', 'No incidents match the current filters.');
      return;
    }
    setExporting(true);
    try {
      const rows = filtered.map(r => ({
        device:      r.deviceName,
        category:    catLabel(r.deviceCategory),
        temperature: r.max_temperature,
        humidity:    '--',
        timestamp:   formatTimestamp(r.start_time).replace('\n', ' ') + (r.end_time ? ` → ${formatTimestamp(r.end_time).replace('\n', ' ')}` : ' (Ongoing)'),
      }));
      const start = formatDate(startDate);
      const end   = formatDate(endDate);
      const uri   = format === 'PDF'
        ? await exportReportPdf(rows, start, end, selectedCategoryLabel)
        : await exportReportExcel(rows, start, end, selectedCategoryLabel);
      Alert.alert('Export Successful', `Saved to Downloads.\n\n${uri}`, [{ text: 'OK' }]);
    } catch {
      Alert.alert('Export Failed', 'Could not export incidents.');
    } finally {
      setExporting(false);
    }
  };

  // ── Render header (filters + table head) ──────────────────────────────────
  const renderHeader = () => (
    <View>
      {/* Filter card */}
      <View style={styles.filterCard}>
        <Text style={styles.filterLabel}>Category</Text>
        <TouchableOpacity style={styles.dropdown} onPress={() => setShowCategoryDropdown(v => !v)} activeOpacity={0.8}>
          <Text style={styles.dropdownText}>{selectedCategoryLabel}</Text>
          <Ionicons name={showCategoryDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
        </TouchableOpacity>
        {showCategoryDropdown && (
          <View style={styles.dropdownList}>
            {CATEGORY_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.value}
                style={[styles.dropdownItem, o.value === category && styles.dropdownItemActive]}
                onPress={() => { setCategory(o.value); setShowCategoryDropdown(false); }}
              >
                <Text style={[styles.dropdownItemText, o.value === category && styles.dropdownItemTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Week / Month / Custom */}
        <View style={styles.tabRow}>
          {(['Week', 'Month', 'Custom'] as TimeRange[]).map(t => (
            <TouchableOpacity key={t} style={[styles.tab, timeRange === t && styles.tabActive]} onPress={() => applyTimeRange(t)}>
              <Text style={[styles.tabText, timeRange === t && styles.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date inputs — only for Custom */}
        {timeRange === 'Custom' && (
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
        )}
      </View>

      {/* Section title + export */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>
          {filtered.length} Incident{filtered.length !== 1 ? 's' : ''}
        </Text>
        <View style={styles.exportBtns}>
          <TouchableOpacity style={styles.exportBtn} onPress={() => exportAs('PDF')} disabled={exporting}>
            <Ionicons name="document-text-outline" size={14} color="#fff" />
            <Text style={styles.exportBtnText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportBtn, { backgroundColor: '#7C3AED' }]} onPress={() => exportAs('Excel')} disabled={exporting}>
            <Ionicons name="grid-outline" size={14} color="#fff" />
            <Text style={styles.exportBtnText}>Excel</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Table column headers */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colHead, styles.colDevice]}>DEVICE</Text>
        <Text style={[styles.colHead, styles.colTime]}>TIMESTAMP</Text>
        <Text style={[styles.colHead, styles.colCat]}>CATEGORY</Text>
        <Text style={[styles.colHead, styles.colDur]}>DURATION</Text>
      </View>
      <View style={styles.divider} />
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      {loading
        ? <ActivityIndicator color="#5C6BC0" size="large" />
        : <>
            <Ionicons name="warning-outline" size={44} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No incidents found</Text>
            <Text style={styles.emptySubtitle}>
              {allIncidents.length === 0
                ? 'No incidents have been recorded yet.\nIncidents are created automatically when\na device exceeds its temperature thresholds.'
                : 'No incidents match the current filters.\nTry adjusting the category or date range.'}
            </Text>
          </>
      }
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Incidents</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => `${item.incident_id ?? i}`}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <View style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
            <Text style={[styles.cell, styles.colDevice]} numberOfLines={2}>{item.deviceName}</Text>
            <Text style={[styles.cell, styles.colTime]}>{formatTimestamp(item.start_time)}</Text>
            <Text style={[styles.cell, styles.colCat]}>{catLabel(item.deviceCategory)}</Text>
            <Text style={[styles.cell, styles.colDur]}>{formatDuration(item.start_time, item.end_time)}</Text>
          </View>
        )}
      />

      <DatePickerModal visible={showStartPicker} value={startDate} minDate={THREE_MONTHS_AGO} maxDate={endDate}
        onConfirm={ts => { setStartDate(ts); setShowStartPicker(false); setTimeRange('Custom'); }} onCancel={() => setShowStartPicker(false)} />
      <DatePickerModal visible={showEndPicker} value={endDate} minDate={startDate} maxDate={TODAY_END}
        onConfirm={ts => { setEndDate(ts); setShowEndPicker(false); setTimeRange('Custom'); }} onCancel={() => setShowEndPicker(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#F4F6FB' },
  header:      { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  list:        { paddingBottom: 32 },

  filterCard: { backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 16, gap: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  filterLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },

  dropdown:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fff' },
  dropdownText: { fontSize: 15, color: '#1C1C1E' },
  dropdownList: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden', marginTop: -8 },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemActive: { backgroundColor: '#EEF0FB' },
  dropdownItemText: { fontSize: 15, color: '#1C1C1E' },
  dropdownItemTextActive: { color: '#5C6BC0', fontWeight: '600' },

  tabRow:       { flexDirection: 'row', backgroundColor: '#F4F6FB', borderRadius: 10, padding: 3 },
  tab:          { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabActive:    { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText:      { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  tabTextActive:{ fontSize: 14, color: '#1C1C1E', fontWeight: '700' },

  dateRow:   { flexDirection: 'row', gap: 12 },
  dateCol:   { flex: 1, gap: 6 },
  dateLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8 },
  dateInput: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff' },
  dateText:  { fontSize: 13, color: '#1C1C1E' },

  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  exportBtns:   { flexDirection: 'row', gap: 8 },
  exportBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#5C6BC0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  exportBtnText:{ color: '#fff', fontSize: 12, fontWeight: '700' },

  tableHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F4F6FB' },
  divider:     { height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 16 },
  colHead:     { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.4 },
  tableRow:    { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14 },
  tableRowAlt: { backgroundColor: '#F8F9FF' },
  cell:        { fontSize: 13, color: '#1C1C1E', lineHeight: 18 },

  colDevice: { flex: 2 },
  colTime:   { flex: 2.2 },
  colCat:    { flex: 2 },
  colDur:    { flex: 1.5, textAlign: 'right' },

  emptyWrap:     { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  emptyTitle:    { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySubtitle: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
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
  actions:          { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn:        { paddingHorizontal: 16, paddingVertical: 8 },
  cancelText:       { fontSize: 14, color: '#9CA3AF' },
});
