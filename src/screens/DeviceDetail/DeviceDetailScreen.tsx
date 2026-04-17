import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/store';
import { getReadingsByDevice, getReadingsLast7Days, insertReadings } from '../../database/repositories/readingRepository';
import { getIncidentsByDevice } from '../../database/repositories/incidentRepository';
import { updateDeviceSync } from '../../database/repositories/deviceRepository';
import { connect, readThHistoryData, onThHistoryData, onConnState, disConnect, setThAlarmValue, setOpenHistoryDataStore, resetDevice } from '../../services/bluetoothService';
import { exportPdf } from '../../services/exportService';
import { useLiveDeviceState } from '../../hooks/useLiveDevice';
import { Reading } from '../../types/reading';
import { applySecretKey } from '../../services/secretKeyService';

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
  data, color, highThreshold, lowThreshold, unit, xLabels: customXLabels,
}: {
  data: number[];
  color: string;
  highThreshold?: number;
  lowThreshold?: number;
  unit: string;
  xLabels?: string[];
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
  const xLabels = customXLabels ?? Array.from({ length: data.length }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (data.length - 1 - i));
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
  const liveState = useLiveDeviceState(device?.mac_address);

  const [readings, setReadings] = useState<Reading[]>([]);
  const [recent7, setRecent7] = useState<Reading[]>([]);
  const [incidentCount, setIncidentCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [poweringOff, setPoweringOff] = useState(false);
  const updateDeviceStore = useAppStore(s => s.updateDevice);

  useEffect(() => {
    if (!deviceId) return;
    getReadingsByDevice(deviceId, 500).then(setReadings).catch(console.error);
    getReadingsLast7Days(deviceId).then(setRecent7).catch(console.error);
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
  const currentTemp = liveState?.temperature ?? null;
  const currentHumidity = liveState?.humidity ?? null;
  const currentBattery = liveState?.battery ?? device.battery_level;

  // Build daily averages — always 7 slots, null = no data that day
  const now = Date.now();
  const buildDailyPoints = (key: 'temperature' | 'humidity') => {
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = now - (6 - i) * 86400000;
      const dayEnd   = dayStart + 86400000;
      const dayVals = recent7
        .filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd)
        .map(r => key === 'temperature' ? r.temperature : r.humidity)
        .filter((v): v is number => v != null);
      return dayVals.length ? dayVals.reduce((a, b) => a + b, 0) / dayVals.length : null;
    });
  };

  const tempSlots = buildDailyPoints('temperature'); // 7 slots, null = no data
  const humSlots  = buildDailyPoints('humidity');

  // For LineGraph: only pass non-null values with their labels
  const tempPoints = tempSlots.map((v, i) => ({ val: v, i })).filter(p => p.val !== null) as { val: number; i: number }[];
  const humPoints  = humSlots.map((v, i) => ({ val: v, i })).filter(p => p.val !== null) as { val: number; i: number }[];
  const tempData   = tempPoints.map(p => p.val);
  const humData    = humPoints.map(p => p.val);
  const allXLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 86400000);
    return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
  });
  const tempXLabels = tempPoints.map(p => allXLabels[p.i]);
  const humXLabels  = humPoints.map(p => allXLabels[p.i]);

  const avgTemp = recent7.length ? avg(recent7.map(r => r.temperature)) : null;
  const avgHum = recent7.length
    ? avg(recent7.map(r => r.humidity).filter((v): v is number => v != null))
    : null;

  // Last sync in minutes
  const lastSyncMins = device.last_sync
    ? Math.round((Date.now() - device.last_sync) / 60000)
    : null;

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    let batteryFromBle: number | undefined = device.battery_level ?? undefined;
    let connectionSubscription: any;
    let historySubscription: any;
    let connTimer: any;
    let histTimer: any;

    const cleanup = () => {
      clearTimeout(connTimer);
      clearTimeout(histTimer);
      connectionSubscription?.remove?.();
      historySubscription?.remove?.();
    };

    try {
      // Apply this device's secret key before connecting
      if (device.secret_key) {
        const { setSecretKey } = await import('../../services/bluetoothService');
        setSecretKey(device.secret_key);
      } else {
        applySecretKey();
      }

      // Step 1: connect and wait for connected_complete
      await new Promise<void>((resolve, reject) => {
        connTimer = setTimeout(() => reject(new Error('Connection timed out')), 25000);
        connectionSubscription = onConnState((event: any) => {
          const mac = (event?.mac ?? '').toUpperCase();
          const devMac = device.mac_address.toUpperCase();
          if (mac !== devMac) return;
          if (typeof event.battery === 'number') batteryFromBle = event.battery;
          if (event.state === 'connected_complete') {
            clearTimeout(connTimer);
            resolve();
          } else if (event.state === 'password_error') {
            clearTimeout(connTimer);
            reject(new Error('Password verification failed'));
          }
        });
        connect(device.mac_address);
      });

      // Step 2a: enable history storage on device (idempotent, 5s timeout)
      try {
        await Promise.race([
          setOpenHistoryDataStore(device.mac_address, true),
          new Promise(r => setTimeout(r, 5000)),
        ]);
      } catch (_) {}

      // Step 2b: push alarm thresholds to device (5s timeout)
      try {
        await Promise.race([
          setThAlarmValue(
            device.mac_address,
            Math.round(device.temp_low_threshold),
            Math.round(device.temp_high_threshold),
            0, 100
          ),
          new Promise(r => setTimeout(r, 5000)),
        ]);
      } catch (_) {}

      // Step 3: request history and wait for the callback
      const historyItems = await new Promise<any[]>((resolve, reject) => {
        histTimer = setTimeout(() => resolve([]), 30000); // resolve empty on timeout — don't fail
        historySubscription = onThHistoryData((event: any) => {
          clearTimeout(histTimer);
          const payload = Array.isArray(event) ? { history: event } : event;
          resolve(Array.isArray(payload.history) ? payload.history : []);
        });
        readThHistoryData(device.mac_address);
      });

      // Step 3: parse timestamps and persist
      const parseTimestamp = (ts: any): number => {
        if (typeof ts === 'number' && ts > 1000000000) return ts * (ts < 1e12 ? 1000 : 1);
        if (typeof ts === 'string') {
          const parsed = Date.parse(ts.replace(' ', 'T'));
          if (!isNaN(parsed)) return parsed;
        }
        return Date.now();
      };

      const readingsToInsert: Omit<Reading, 'reading_id'>[] = historyItems
        .filter((item: any) => item != null && item.temperature != null)
        .map((item: any) => ({
          device_id: device.device_id,
          temperature: Number(item.temperature),
          humidity: item.humidity != null ? Number(item.humidity) : null,
          timestamp: parseTimestamp(item.timestamp),
        }));

      if (readingsToInsert.length > 0) {
        await insertReadings(readingsToInsert);
      }

      const syncTime = Date.now();
      await updateDeviceSync(device.device_id, syncTime, batteryFromBle);
      updateDeviceStore({ ...device, battery_level: batteryFromBle ?? device.battery_level, last_sync: syncTime });

      const fresh = await getReadingsByDevice(deviceId, 500);
      setReadings(fresh);
      const fresh7 = await getReadingsLast7Days(deviceId);
      setRecent7(fresh7);
      const freshIncidents = await getIncidentsByDevice(deviceId);
      setIncidentCount(freshIncidents.length);
      Alert.alert('Sync Complete', readingsToInsert.length > 0
        ? `Saved ${readingsToInsert.length} readings.`
        : 'No new history data from device.');
    } catch (error: any) {
      Alert.alert('Sync Failed', error?.message || 'Could not sync device data.');
    } finally {
      cleanup();
      disConnect(device.mac_address);
      setSyncing(false);
    }
  };

  const handlePowerOff = () => {
    Alert.alert(
      'Power Off Device',
      `Disconnect and power off ${device.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Power Off', style: 'destructive',
          onPress: async () => {
            setPoweringOff(true);
            try {
              disConnect(device.mac_address);
              Alert.alert('Powered Off', `${device.name} has been disconnected.`);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not power off device.');
            } finally {
              setPoweringOff(false);
            }
          },
        },
      ]
    );
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Device',
      `This will factory-reset ${device.name} and clear all its stored data. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive',
          onPress: async () => {
            setResetting(true);
            let connSub: any;
            let connTimer: any;
            try {
              // Apply this device's secret key before connecting
              if (device.secret_key) {
                const { setSecretKey } = await import('../../services/bluetoothService');
                setSecretKey(device.secret_key);
              } else {
                applySecretKey();
              }
              await new Promise<void>((resolve, reject) => {
                connTimer = setTimeout(() => reject(new Error('Connection timed out')), 20000);
                connSub = onConnState((event: any) => {
                  if ((event?.mac ?? '').toUpperCase() !== device.mac_address.toUpperCase()) return;
                  if (event.state === 'connected_complete') { clearTimeout(connTimer); resolve(); }
                  else if (event.state === 'password_error') { clearTimeout(connTimer); reject(new Error('Password error')); }
                });
                connect(device.mac_address);
              });
              await resetDevice(device.mac_address);
              Alert.alert('Reset Complete', `${device.name} has been reset to factory settings.`);
            } catch (e: any) {
              Alert.alert('Reset Failed', e?.message || 'Could not reset device.');
            } finally {
              clearTimeout(connTimer);
              connSub?.remove?.();
              disConnect(device.mac_address);
              setResetting(false);
            }
          },
        },
      ]
    );
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
            value={currentBattery ?? '--'}
            unit={currentBattery != null ? '%' : ''} />
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
            xLabels={tempXLabels}
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
            {tempPoints.map((p, i) => {
              const d = new Date(now - (6 - p.i) * 86400000);
              const dayStart = now - (6 - p.i) * 86400000;
              const dayEnd = dayStart + 86400000;
              const vals = recent7.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd).map(r => r.temperature);
              return (
                <View key={i} style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2}}>
                  <Text style={styles.tableCell}>{`${d.toLocaleString('en',{month:'short'})} ${d.getDate()}`}</Text>
                  <Text style={styles.tableCell}>{p.val.toFixed(1)}</Text>
                  <Text style={styles.tableCell}>{Math.min(...vals).toFixed(1)}</Text>
                  <Text style={styles.tableCell}>{Math.max(...vals).toFixed(1)}</Text>
                  <Text style={styles.tableCell}>{vals.length}</Text>
                </View>
              );
            })}
          </View>
          {/* Export button */}
          <TouchableOpacity style={styles.exportBtn} onPress={() => exportPdf(device.device_id, 'last-7-days').catch(console.error)}>
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
          <LineGraph data={humData} color="#06B6D4" unit="%" xLabels={humXLabels} />
          {/* Table for humidity */}
          <View style={{marginTop: 12}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
              <Text style={styles.tableHeader}>Date</Text>
              <Text style={styles.tableHeader}>Avg</Text>
              <Text style={styles.tableHeader}>Count</Text>
            </View>
            {humPoints.map((p, i) => {
              const d = new Date(now - (6 - p.i) * 86400000);
              const dayStart = now - (6 - p.i) * 86400000;
              const dayEnd = dayStart + 86400000;
              const vals = recent7.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd).map(r => r.humidity).filter((v): v is number => v != null);
              return (
                <View key={i} style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2}}>
                  <Text style={styles.tableCell}>{`${d.toLocaleString('en',{month:'short'})} ${d.getDate()}`}</Text>
                  <Text style={styles.tableCell}>{p.val.toFixed(1)}</Text>
                  <Text style={styles.tableCell}>{vals.length}</Text>
                </View>
              );
            })}
          </View>
          {/* Export button */}
          <TouchableOpacity style={styles.exportBtn} onPress={() => exportPdf(device.device_id, 'last-7-days').catch(console.error)}>
            <Ionicons name="download-outline" size={16} color="#06B6D4" />
            <Text style={styles.exportBtnText}>Export PDF/Excel</Text>
          </TouchableOpacity>
        </View>

        {/* Device Controls */}
        <Text style={styles.sectionLabel}>Device Controls</Text>
        <View style={styles.controlsGrid}>
          {/* Sync */}
          <TouchableOpacity
            style={[styles.controlBtn, styles.controlBtnPrimary, syncing && { opacity: 0.7 }]}
            onPress={handleSync} disabled={syncing} activeOpacity={0.85}
          >
            <Ionicons name="sync-outline" size={20} color="#fff" />
            <Text style={styles.controlBtnText}>{syncing ? 'Syncing...' : 'Sync Data'}</Text>
          </TouchableOpacity>

          {/* Reconfigure */}
          <TouchableOpacity
            style={[styles.controlBtn, styles.controlBtnOutline]}
            onPress={() => navigation.navigate('DeviceConfig', {
              isReconfigure: true, deviceId: device.device_id,
              scannedDevice: { name: device.name, macAddress: device.mac_address, category: device.category },
            })}
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={20} color="#5C6BC0" />
            <Text style={styles.controlBtnOutlineText}>Reconfigure</Text>
          </TouchableOpacity>

          {/* Power Off */}
          <TouchableOpacity
            style={[styles.controlBtn, styles.controlBtnWarning, poweringOff && { opacity: 0.7 }]}
            onPress={handlePowerOff} disabled={poweringOff} activeOpacity={0.85}
          >
            <Ionicons name="power-outline" size={20} color="#fff" />
            <Text style={styles.controlBtnText}>{poweringOff ? 'Powering Off...' : 'Power Off'}</Text>
          </TouchableOpacity>

          {/* Reset */}
          <TouchableOpacity
            style={[styles.controlBtn, styles.controlBtnDanger, resetting && { opacity: 0.7 }]}
            onPress={handleReset} disabled={resetting} activeOpacity={0.85}
          >
            <Ionicons name="refresh-circle-outline" size={20} color="#fff" />
            <Text style={styles.controlBtnText}>{resetting ? 'Resetting...' : 'Reset Device'}</Text>
          </TouchableOpacity>
        </View>

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

  // Section label
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: -4 },

  // Controls grid
  controlsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  controlBtn: {
    width: '47.5%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 16,
  },
  controlBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  controlBtnPrimary: {
    backgroundColor: '#5C6BC0',
    shadowColor: '#5C6BC0', shadowOpacity: 0.35, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  controlBtnOutline: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#5C6BC0',
  },
  controlBtnOutlineText: { color: '#5C6BC0', fontSize: 14, fontWeight: '700' },
  controlBtnWarning: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B', shadowOpacity: 0.35, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  controlBtnDanger: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444', shadowOpacity: 0.35, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },

  // Table styles
  tableHeader: { fontWeight: '700', color: '#5C6BC0', fontSize: 12, flex: 1, textAlign: 'center' },
  tableCell: { color: '#1C1C1E', fontSize: 12, flex: 1, textAlign: 'center' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8, alignSelf: 'flex-end' },
  exportBtnText: { color: '#5C6BC0', fontWeight: '700', marginLeft: 6 },
});
