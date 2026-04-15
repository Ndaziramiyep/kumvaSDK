import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAllIncidents } from '../../database/repositories/incidentRepository';
import { useAppStore } from '../../store/store';
import { Incident } from '../../types/incident';
import { Device } from '../../types/device';
import { exportPdf, exportExcel } from '../../services/exportService';

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + '\n'
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(eas loginWaiting for build to complete. You can press Ctrl+C to exit.
✖ Build failed

🤖 Android build failed:
Gradle build failed with unknown error. See logs for the "Run gradlew" (https://expo.dev/accounts/tonzichantal7/projects/sdkapp/builds/f32dca5c-56ef-4d28-bcba-7c34391473b8#run-gradlew) phase for more information.
PS C:\Users\CHANTAL\Desktop\kumvaSDK> start: number, end?: number | null): string {
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

type Row = Incident & { deviceName: string; deviceCategory: string };

const SAMPLE_INCIDENTS: Row[] = [
  { incident_id: 's1', device_id: 'd1', start_time: Date.now() - 2 * 3600000,   end_time: Date.now() - 1 * 3600000,   deviceName: 'Main Freezer 01',  deviceCategory: 'freezer'   },
  { incident_id: 's2', device_id: 'd2', start_time: Date.now() - 6 * 3600000,   end_time: Date.now() - 5 * 3600000,   deviceName: 'Fridge Unit A',    deviceCategory: 'fridge'    },
  { incident_id: 's3', device_id: 'd3', start_time: Date.now() - 26 * 3600000,  end_time: null,                        deviceName: 'Cold Room North',  deviceCategory: 'cold_room' },
  { incident_id: 's4', device_id: 'd4', start_time: Date.now() - 48 * 3600000,  end_time: Date.now() - 46 * 3600000,  deviceName: 'General Store B',  deviceCategory: 'general'   },
  { incident_id: 's5', device_id: 'd1', start_time: Date.now() - 72 * 3600000,  end_time: Date.now() - 71 * 3600000,  deviceName: 'Main Freezer 01',  deviceCategory: 'freezer'   },
  { incident_id: 's6', device_id: 'd5', start_time: Date.now() - 96 * 3600000,  end_time: Date.now() - 94 * 3600000,  deviceName: 'Fridge Unit B',    deviceCategory: 'fridge'    },
  { incident_id: 's7', device_id: 'd3', start_time: Date.now() - 120 * 3600000, end_time: Date.now() - 118 * 3600000, deviceName: 'Cold Room North',  deviceCategory: 'cold_room' },
  { incident_id: 's8', device_id: 'd6', start_time: Date.now() - 144 * 3600000, end_time: Date.now() - 143 * 3600000, deviceName: 'Freezer Unit 02',  deviceCategory: 'freezer'   },
];

export default function IncidentsScreen({ navigation }: any) {
  const devices = useAppStore(s => s.devices);
  const [incidents, setIncidents] = useState<Row[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getAllIncidents()
      .then(data => {
        const deviceMap = new Map<string, Device>(devices.map(d => [d.device_id, d]));
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
    if (!search.trim()) return incidents;
    const q = search.toLowerCase();
    return incidents.filter(r =>
      r.deviceName.toLowerCase().includes(q) ||
      r.deviceCategory.toLowerCase().includes(q)
    );
  }, [incidents, search]);

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
      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#B0B8C8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search incidents..."
          placeholderTextColor="#B0B8C8"
          value={search}
          onChangeText={setSearch}
        />
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

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 11, margin: 16, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1C1C1E' },

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
