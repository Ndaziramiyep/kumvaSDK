import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/store';
import { getReadingsByDevice } from '../../database/repositories/readingRepository';
import { getIncidentsByDevice } from '../../database/repositories/incidentRepository';
import { updateDeviceSync } from '../../database/repositories/deviceRepository';
import { connect, sendPassword, readThHistoryData, onThHistoryData, disConnect } from '../../services/bluetoothService';
import { addReading } from '../../services/cacheService';
import { Reading } from '../../types/reading';

const GRAPH_H = 110;

function getLastNDaysReadings(readings: Reading[], days: number): Reading[] {
  const cutoff = Date.now() - days * 86400000;
  return readings.filter(r => r.timestamp >= cutoff);
}

function avg(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── Line graph ────────────────────────────────────────────────────────────────
function LineGraph({
  data, color, highThreshold, lowThreshold, unit,
}: {
  data: number[];
  color: string;
  highThreshold?: number;
  lowThreshold?: number;
  unit: string;
}) {
  const [plotWidth, setPlotWidth] = useState(0);

  if (data.length < 2) {
    return (
      <View style={{ height: GRAPH_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, color: '#9CA3AF' }}>No data yet</Text>
      </View>
    );
  }

  const extras: number[] = [];
  if (highThreshold !== undefined) extras.push(highThreshold);
  if (lowThreshold !== undefined) extras.push(lowThreshold);
  const allVals = [...data, ...extras];
  const minV = Math.min(...allVals) - 1;
  const maxV = Math.max(...allVals) + 1;
  const range = maxV - minV || 1;
  const toY = (v: number) => GRAPH_H - ((v - minV) / range) * GRAPH_H;

  const yLabels = [maxV, maxV * 0.75 + minV * 0.25, (maxV + minV) / 2, maxV * 0.25 + minV * 0.75, minV].map(v =>
    unit === '%' ? `${Math.round(v)}%` : `${Math.round(v)}°`
  );

  const Y_AXIS_W = 36;
  const xLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
  });

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Y axis labels + ticks */}
        <View style={{ width: Y_AXIS_W, height: GRAPH_H, justifyContent: 'space-between' }}>
          {yLabels.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
              <Text style={styles.yLabel}>{l}</Text>
              <View style={styles.yTick} />
            </View>
          ))}
        </View>

        {/* Y axis line + plot */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', height: GRAPH_H }}>
            {/* Visible Y axis line */}
            <View style={styles.yAxisLine} />

            {/* Plot area */}
            <View
              style={{ flex: 1, height: GRAPH_H }}
              onLayout={e => setPlotWidth(e.nativeEvent.layout.width)}
            >
              {plotWidth > 0 && (() => {
                const step = plotWidth / (data.length - 1);
                const points = data.map((v, i) => ({ x: i * step, y: toY(v) }));
                return (
                  <>
                    {yLabels.map((_, i) => (
                      <View key={i} style={[styles.gridLine, { top: (i / (yLabels.length - 1)) * GRAPH_H }]} />
                    ))}
                    {highThreshold !== undefined && (
                      <View style={[styles.threshLine, { top: toY(highThreshold), borderColor: '#EF4444' }]} />
                    )}
                    {lowThreshold !== undefined && (
                      <View style={[styles.threshLine, { top: toY(lowThreshold), borderColor: '#3B82F6' }]} />
                    )}
                    {points.slice(0, -1).map((p, i) => {
                      const next = points[i + 1];
                      const dx = next.x - p.x; const dy = next.y - p.y;
                      const len = Math.sqrt(dx * dx + dy * dy);
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      return (
                        <View key={i} style={{
                          position: 'absolute', left: p.x, top: p.y,
                          width: len, height: 2, backgroundColor: color,
                          transformOrigin: '0 50%',
                          transform: [{ rotate: `${angle}deg` }],
                        }} />
                      );
                    })}
                  </>
                );
              })()}
            </View>
          </View>

          {/* Visible X axis line */}
          <View style={styles.xAxisLine} />

          {/* X labels */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            {xLabels.map((l, i) => (
              <Text key={i} style={styles.xLabel}>{l}</Text>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ iconName, label, value, unit, valueColor, iconColor }: {
  iconName: keyof typeof Ionicons.glyphMap; label: string; value: string | number; unit: string; valueColor?: string; iconColor?: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <Ionicons name={iconName} size={13} color={iconColor ?? '#9CA3AF'} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <View style={styles.statBottom}>
        <Text style={[styles.statValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
        <Text style={styles.statUnit}> {unit}</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DeviceDetailScreen({ navigation, route }: any) {
  const { deviceId } = route.params ?? {};
  const devices = useAppStore(s => s.devices);
  const device = devices.find(d => d.device_id === deviceId);

  const [readings, setReadings] = useState<Reading[]>([]);
  const [incidentCount, setIncidentCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!deviceId) return;
    getReadingsByDevice(deviceId, 500).then(setReadings).catch(console.error);
    getIncidentsByDevice(deviceId).then(r => setIncidentCount(r.length)).catch(console.error);
  }, [deviceId]);

  if (!device) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Device</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#9CA3AF' }}>Device not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const recent = getLastNDaysReadings(readings, 7);
  const latestReading = readings[0];
  const currentTemp = latestReading?.temperature ?? null;
  const currentHumidity = latestReading?.humidity ?? null;

  // Build daily averages for graphs (7 buckets)
  const now = Date.now();
  const tempByDay = Array.from({ length: 7 }, (_, i) => {
    const dayStart = now - (6 - i) * 86400000;
    const dayEnd = dayStart + 86400000;
    const vals = recent
      .filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd)
      .map(r => r.temperature);
    return vals.length ? avg(vals) : null;
  });

  const humByDay = Array.from({ length: 7 }, (_, i) => {
    const dayStart = now - (6 - i) * 86400000;
    const dayEnd = dayStart + 86400000;
    const vals = recent
      .filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd)
      .map(r => r.humidity)
      .filter((v): v is number => v != null);
    return vals.length ? avg(vals) : null;
  });

  // Fill nulls with interpolation for display
  const fillNulls = (arr: (number | null)[]): number[] => {
    const filled = [...arr];
    for (let i = 0; i < filled.length; i++) {
      if (filled[i] === null) filled[i] = filled[i - 1] ?? filled[i + 1] ?? 0;
    }
    return filled as number[];
  };

  const tempData = fillNulls(tempByDay);
  const humData = fillNulls(humByDay);

  const avgTemp = recent.length ? avg(recent.map(r => r.temperature)) : null;
  const avgHum = recent.length
    ? avg(recent.map(r => r.humidity).filter((v): v is number => v != null))
    : null;

  // Last sync in minutes
  const lastSyncMins = device.last_sync
    ? Math.round((Date.now() - device.last_sync) / 60000)
    : null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      // BLE read
      const password = '000000'; // Assume default password
      connect(device.mac_address);
      // Wait a bit for connection
      await new Promise(resolve => setTimeout(resolve, 2000));
      sendPassword(device.mac_address, password);
      // Wait for password
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Listen for data
      const subscription = onThHistoryData((data: any[]) => {
        // Process data into readings
        for (const item of data) {
          // Assume data format: { temperature, humidity, timestamp }
          const reading: Reading = {
            device_id: device.device_id,
            temperature: item.temperature,
            humidity: item.humidity,
            timestamp: item.timestamp || Date.now(),
          };
          addReading(reading);
        }
        subscription.remove();
        disConnect(device.mac_address);
      });
      readThHistoryData(device.mac_address);
      // Wait for data, say 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      // Then update sync
      await updateDeviceSync(device.device_id, Date.now(), device.battery_level ?? undefined);
      // Refresh readings
      const fresh = await getReadingsByDevice(deviceId, 500);
      setReadings(fresh);
      Alert.alert('Sync Complete', 'Device data has been refreshed.');
    } catch {
      Alert.alert('Sync Failed', 'Could not sync device data.');
    } finally {
      setSyncing(false);
    }
  };

  const categoryLabel = device.category === 'cold_room' ? 'COLD ROOM'
    : device.category === 'general' ? 'GENERAL AREA'
    : device.category.toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{categoryLabel}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Top 2 stats: Temp + Humidity */}
        <View style={styles.statsRow}>
          <StatCard iconName="thermometer-outline" iconColor="#5C6BC0" label="TEMPERATURE"
            value={currentTemp !== null ? currentTemp.toFixed(1) : '--'}
            unit="°C" />
          <StatCard iconName="water-outline" iconColor="#06B6D4" label="HUMIDITY"
            value={currentHumidity !== null ? Math.round(currentHumidity) : '--'}
            unit="%" />
        </View>

        {/* Bottom 3 stats: Battery + Last Sync + Incidents */}
        <View style={styles.statsRow}>
          <StatCard iconName="battery-half-outline" iconColor="#22C55E" label="BATTERY"
            value={device.battery_level ?? '--'}
            unit={device.battery_level != null ? '%' : ''} />
          <StatCard iconName="sync-outline" iconColor="#5C6BC0" label="LAST SYNC"
            value={lastSyncMins !== null ? lastSyncMins : '--'}
            unit={lastSyncMins !== null ? 'min' : ''} />
          <StatCard iconName="warning-outline" iconColor="#EF4444" label="INCIDENTS"
            value={incidentCount}
            unit=""
            valueColor={incidentCount > 0 ? '#EF4444' : '#1C1C1E'} />
        </View>


        {/* Temperature graph + table + export */}
        <View style={styles.graphCard}>
          <View style={styles.graphCardHeader}>
            <Text style={styles.graphCardTitle}>Temperature (Last 7 Days)</Text>
            {avgTemp !== null && (
              <View style={styles.avgBadge}>
                <Text style={styles.avgText}>Avg: {avgTemp.toFixed(1)}°C</Text>
              </View>
            )}
          </View>
          <LineGraph
            data={tempData}
            color="#5C6BC0"
            highThreshold={device.temp_high_threshold}
            lowThreshold={device.temp_low_threshold}
            unit="°C"
          />
          {/* Table for temperature */}
          <View style={{marginTop: 12}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
              <Text style={styles.tableHeader}>Date</Text>
              <Text style={styles.tableHeader}>Avg</Text>
              <Text style={styles.tableHeader}>Min</Text>
              <Text style={styles.tableHeader}>Max</Text>
              <Text style={styles.tableHeader}>Count</Text>
            </View>
            {Array.from({length: 7}, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              const dayStart = d.setHours(0,0,0,0);
              const dayEnd = dayStart + 86400000;
              const vals = recent.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd).map(r => r.temperature).filter((v): v is number => v != null);
              const avgV = vals.length ? avg(vals) : null;
              const minV = vals.length ? Math.min(...vals) : null;
              const maxV = vals.length ? Math.max(...vals) : null;
              const dateLabel = `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
              return (
                <View key={i} style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2}}>
                  <Text style={styles.tableCell}>{dateLabel}</Text>
                  <Text style={styles.tableCell}>{avgV !== null ? avgV.toFixed(1) : '--'}</Text>
                  <Text style={styles.tableCell}>{minV !== null ? minV.toFixed(1) : '--'}</Text>
                  <Text style={styles.tableCell}>{maxV !== null ? maxV.toFixed(1) : '--'}</Text>
                  <Text style={styles.tableCell}>{vals.length}</Text>
                </View>
              );
            })}
          </View>
          {/* Export button */}
          <TouchableOpacity style={styles.exportBtn} onPress={() => exportService.exportTemperatureReport(device.device_id)}>
            <Ionicons name="download-outline" size={16} color="#5C6BC0" />
            <Text style={styles.exportBtnText}>Export PDF/Excel</Text>
          </TouchableOpacity>
        </View>


        {/* Humidity graph + table + export */}
        <View style={styles.graphCard}>
          <View style={styles.graphCardHeader}>
            <Text style={styles.graphCardTitle}>Humidity (Last 7 Days)</Text>
            {avgHum !== null && avgHum > 0 && (
              <View style={styles.avgBadge}>
                <Text style={styles.avgText}>Avg: {Math.round(avgHum)}%</Text>
              </View>
            )}
          </View>
          <LineGraph data={humData} color="#06B6D4" unit="%" />
          {/* Table for humidity */}
          <View style={{marginTop: 12}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
              <Text style={styles.tableHeader}>Date</Text>
              <Text style={styles.tableHeader}>Avg</Text>
              <Text style={styles.tableHeader}>Count</Text>
            </View>
            {Array.from({length: 7}, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              const dayStart = d.setHours(0,0,0,0);
              const dayEnd = dayStart + 86400000;
              const vals = recent.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd).map(r => r.humidity).filter((v): v is number => v != null);
              const avgV = vals.length ? avg(vals) : null;
              const dateLabel = `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
              return (
                <View key={i} style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2}}>
                  <Text style={styles.tableCell}>{dateLabel}</Text>
                  <Text style={styles.tableCell}>{avgV !== null ? avgV.toFixed(1) : '--'}</Text>
                  <Text style={styles.tableCell}>{vals.length}</Text>
                </View>
              );
            })}
          </View>
          {/* Export button */}
          <TouchableOpacity style={styles.exportBtn} onPress={() => exportService.exportHumidityReport(device.device_id)}>
            <Ionicons name="download-outline" size={16} color="#06B6D4" />
            <Text style={styles.exportBtnText}>Export PDF/Excel</Text>
          </TouchableOpacity>
        </View>

        {/* Action buttons */}
        <TouchableOpacity
          style={[styles.actionBtn, syncing && { opacity: 0.7 }]}
          onPress={handleSync}
          disabled={syncing}
          activeOpacity={0.85}
        >
          <Ionicons name="sync-outline" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>{syncing ? 'Syncing...' : 'Sync Data'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtnOutline}
          onPress={() => navigation.navigate('DeviceConfig', {
            isReconfigure: true,
            deviceId: device.device_id,
            scannedDevice: {
              name: device.name,
              macAddress: device.mac_address,
              category: device.category,
            },
          })}
          activeOpacity={0.85}
        >
          <Ionicons name="settings-outline" size={18} color="#5C6BC0" />
          <Text style={styles.actionBtnOutlineText}>Reconfigure Device</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6FB' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0',
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#F4F6FB',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#1C1C1E', letterSpacing: 0.5 },

  body: { padding: 16, gap: 14, paddingBottom: 40 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, gap: 6,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 },
  statBottom: { flexDirection: 'row', alignItems: 'baseline' },
  statValue: { fontSize: 26, fontWeight: '800', color: '#1C1C1E' },
  statUnit: { fontSize: 14, color: '#6B7280', fontWeight: '500' },

  // Graph card
  graphCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, gap: 10,
  },
  graphCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  graphCardTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  avgBadge: { backgroundColor: '#EEF0FB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  avgText: { fontSize: 11, color: '#5C6BC0', fontWeight: '600' },

  threshLine: { position: 'absolute', left: 0, right: 0, height: 1, borderTopWidth: 1.5, borderStyle: 'dashed' },
  gridLine:   { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
  yLabel:     { fontSize: 9, color: '#9CA3AF', textAlign: 'right', minWidth: 28 },
  yTick:      { width: 4, height: 1, backgroundColor: '#9CA3AF', marginLeft: 2 },
  yAxisLine:  { width: 1.5, height: GRAPH_H, backgroundColor: '#9CA3AF' },
  xAxisLine:  { height: 1.5, backgroundColor: '#9CA3AF' },
  xLabel:     { fontSize: 8, color: '#9CA3AF', textAlign: 'center' },

  // Action buttons
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#5C6BC0', borderRadius: 14, paddingVertical: 16,
    shadowColor: '#5C6BC0', shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  actionBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16,
    borderWidth: 1.5, borderColor: '#5C6BC0',
  },
  actionBtnOutlineText: { color: '#5C6BC0', fontSize: 16, fontWeight: '700' },

  // Table styles
  tableHeader: { fontWeight: '700', color: '#5C6BC0', fontSize: 12, flex: 1, textAlign: 'center' },
  tableCell: { color: '#1C1C1E', fontSize: 12, flex: 1, textAlign: 'center' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8, alignSelf: 'flex-end' },
  exportBtnText: { color: '#5C6BC0', fontWeight: '700', marginLeft: 6 },
});
