import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAllIncidents } from '../../database/repositories/incidentRepository';
import { useAppStore } from '../../store/store';
import { Incident } from '../../types/incident';
import { Device, DeviceCategory } from '../../types/device';
import { exportPdf, exportExcel } from '../../services/exportService';

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

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    freezer: 'Freezer', fridge: 'Fridge',
    cold_room: 'Cold Room', general: 'General',
  };
  return map[cat] ?? cat;
}

const THREE_MONTHS_AGO = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); d.setHours(0,0,0,0); return d.getTime(); })();
const TODAY_END = (() => { const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); })();

const CATEGORY_OPTIONS: { label: string; value: DeviceCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Freezer', value: 'freezer' },
  { label: 'Fridge', value: 'fridge' },
  { label: 'Cold Room', value: 'cold_room' },
  { label: 'General', value: 'general' },
];

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

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

type Row = Incident & { deviceName: string; deviceCategory: string };

const SAMPLE_INCIDENTS: Row[] = [
  { incident_id: 's1', device_id: 'd1', start_time: Date.now() - 2 * 3600000,   end_time: Date.now() - 1 * 3600000,   max_temperature: 25.2, deviceName: 'Main Freezer 01',  deviceCategory: 'freezer'   },
  { incident_id: 's2', device_id: 'd2', start_time: Date.now() - 6 * 3600000,   end_time: Date.now() - 5 * 3600000,   max_temperature: 22.8, deviceName: 'Fridge Unit A',    deviceCategory: 'fridge'    },
  { incident_id: 's3', device_id: 'd3', start_time: Date.now() - 26 * 3600000,  end_time: null,                        max_temperature: 28.5, deviceName: 'Cold Room North',  deviceCategory: 'cold_room' },
  { incident_id: 's4', device_id: 'd4', start_time: Date.now() - 48 * 3600000,  end_time: Date.now() - 46 * 3600000,  max_temperature: 24.1, deviceName: 'General Store B',  deviceCategory: 'general'   },
  { incident_id: 's5', device_id: 'd1', start_time: Date.now() - 72 * 3600000,  end_time: Date.now() - 71 * 3600000,  max_temperature: 26.7, deviceName: 'Main Freezer 01',  deviceCategory: 'freezer'   },
  { incident_id: 's6', device_id: 'd5', start_time: Date.now() - 96 * 3600000,  end_time: Date.now() - 94 * 3600000,  max_temperature: 23.9, deviceName: 'Fridge Unit B',    deviceCategory: 'fridge'    },
  { incident_id: 's7', device_id: 'd3', start_time: Date.now() - 120 * 3600000, end_time: Date.now() - 118 * 3600000, max_temperature: 27.3, deviceName: 'Cold Room North',  deviceCategory: 'cold_room' },
  { incident_id: 's8', device_id: 'd6', start_time: Date.now() - 144 * 3600000, end_time: Date.now() - 143 * 3600000, max_temperature: 25.8, deviceName: 'Freezer Unit 02',  deviceCategory: 'freezer'   },
];

export default function IncidentsScreen({ navigation }: any) {
  const devices = useAppStore((s: any) => s.devices);
  const [incidents, setIncidents] = useState<Row[]>([]);
  const [category, setCategory] = useState<DeviceCategory | 'all'>('all');
  const [startDate, setStartDate] = useState(THREE_MONTHS_AGO);
  const [endDate, setEndDate] = useState(TODAY_END);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    getAllIncidents()
      .then(data => {
        const deviceMap = new Map<string, Device>(devices.map((d: Device) => [d.device_id, d]));
        const rows: Row[] = data.map(inc => {
          const dev = deviceMap.get(inc.device_id);
          return {
            ...inc,
            deviceName: dev?.name ?? inc.device_id,
            deviceCategory: dev?.category ?? '',
          };
        });
        setIncidents(rows);
      })
      .catch(console.error);
  }, [devices]);

  const filtered = useMemo(() => {
    return incidents.filter(r => {
      const matchCat = category === 'all' || r.deviceCategory === category;
      const matchDate = r.start_time >= startDate && r.start_time <= endDate;
      return matchCat && matchDate;
    });
  }, [incidents, category, startDate, endDate]);

  const displayData = filtered.length > 0 ? filtered : SAMPLE_INCIDENTS;
  const isSample = filtered.length === 0;

  const exportAs = async (format: 'PDF' | 'Excel') => {
    if (filtered.length === 0) {
      Alert.alert('No Data', 'No incidents to export.');
      return;
    }
    try {
      // For demo, export for first device or all
      const deviceId = filtered[0].device_id;
      const period = 'all';
      const fileUri = format === 'PDF' ? await exportPdf(deviceId, period) : await exportExcel(deviceId, period);
      Alert.alert('Export Successful', `File saved at ${fileUri}`);
    } catch (error) {
      Alert.alert('Export Failed', 'Could not export data.');
    }
  };

  const renderHeader = () => (
    <View>
      {/* Category chips */}
      <View style={styles.chipsRow}>
        {CATEGORY_OPTIONS.map(o => (
          <TouchableOpacity key={o.value} style={[styles.chip, category === o.value && styles.chipActive]}
            onPress={() => setCategory(o.value)}>
            <Text style={[styles.chipText, category === o.value && styles.chipTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Date range */}
      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.dateInput} onPress={() => setShowStartPicker(true)}>
          <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />
          <Text style={styles.dateText}>{formatDate(startDate)}</Text>
        </TouchableOpacity>
        <Text style={styles.dateSep}>→</Text>
        <TouchableOpacity style={styles.dateInput} onPress={() => setShowEndPicker(true)}>
          <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />
          <Text style={styles.dateText}>{formatDate(endDate)}</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Activity + Export */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {isSample && (
          <View style={styles.sampleBadge}>
            <Text style={styles.sampleBadgeText}>SAMPLE DATA</Text>
          </View>
        )}
      </View>
      <View style={styles.exportRow}>
        <TouchableOpacity style={styles.exportBtn} onPress={() => exportAs('PDF')} activeOpacity={0.85}>
          <Ionicons name="document-text-outline" size={15} color="#fff" />
          <Text style={styles.exportText}>Export as PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.exportBtn, styles.exportBtnSecondary]} onPress={() => exportAs('Excel')} activeOpacity={0.85}>
          <Ionicons name="grid-outline" size={15} color="#fff" />
          <Text style={styles.exportText}>Export as Excel</Text>
        </TouchableOpacity>
      </View>

      {/* Table header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colHead, styles.colDevice]}>DEVICE</Text>
        <Text style={[styles.colHead, styles.colTime]}>TIME{'\n'}STAMP</Text>
        <Text style={[styles.colHead, styles.colCat]}>CATEGORY</Text>
        <Text style={[styles.colHead, styles.colDur]}>DURATION</Text>
      </View>
      <View style={styles.divider} />
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="warning-outline" size={40} color="#D1D5DB" />
      <Text style={styles.emptyText}>No incidents recorded yet</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Incidents</Text>
      </View>

      <FlatList
        data={displayData}
        keyExtractor={(item, i) => `${item.incident_id ?? i}`}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <View style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
            <Text style={[styles.cell, styles.colDevice]} numberOfLines={2}>{item.deviceName}</Text>
            <Text style={[styles.cell, styles.colTime]}>{formatTimestamp(item.start_time)}</Text>
            <Text style={[styles.cell, styles.colCat]}>{categoryLabel(item.deviceCategory)}</Text>
            <Text style={[styles.cell, styles.colDur]}>{formatDuration(item.start_time, item.end_time)}</Text>
          </View>
        )}
      />

      <DatePickerModal visible={showStartPicker} value={startDate} minDate={THREE_MONTHS_AGO} maxDate={endDate}
        onConfirm={ts => { setStartDate(ts); setShowStartPicker(false); }} onCancel={() => setShowStartPicker(false)} />
      <DatePickerModal visible={showEndPicker} value={endDate} minDate={startDate} maxDate={TODAY_END}
        onConfirm={ts => { setEndDate(ts); setShowEndPicker(false); }} onCancel={() => setShowEndPicker(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6FB' },

  header: {
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },

  list: { paddingBottom: 32 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginTop: 14, marginBottom: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0F2FA', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  chipText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 14 },
  dateInput: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 10 },
  dateText: { fontSize: 13, color: '#1C1C1E' },
  dateSep: { fontSize: 16, color: '#9CA3AF' },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  sampleBadge: { backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sampleBadgeText: { fontSize: 10, fontWeight: '700', color: '#D97706', letterSpacing: 0.5 },

  exportRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 16 },
  exportBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#5C6BC0', borderRadius: 12, paddingVertical: 13,
    shadowColor: '#5C6BC0', shadowOpacity: 0.3, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  exportBtnSecondary: { backgroundColor: '#7C3AED' },
  exportText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Table
  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#F4F6FB',
  },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 16 },
  colHead: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.4 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14 },
  tableRowAlt: { backgroundColor: '#F8F9FF' },
  cell: { fontSize: 13, color: '#1C1C1E', lineHeight: 18 },

  // Column widths
  colDevice: { flex: 2 },
  colTime: { flex: 2.2 },
  colCat: { flex: 2 },
  colDur: { flex: 1.5, textAlign: 'right' },

  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});

const dp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: 320 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  arrow: { fontSize: 24, color: '#5C6BC0', paddingHorizontal: 8 },
  arrowDisabled: { opacity: 0.25 },
  monthYear: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  cellSelected: { backgroundColor: '#5C6BC0' },
  cellDisabled: { opacity: 0.25 },
  cellText: { fontSize: 13, color: '#1C1C1E' },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
  cellTextDisabled: { color: '#9CA3AF' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelText: { fontSize: 14, color: '#9CA3AF' },
});
