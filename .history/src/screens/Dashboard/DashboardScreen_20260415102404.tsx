import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Animated, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDevices } from '../../hooks/useDevices';
import { getReadingsByDevice } from '../../database/repositories/readingRepository';
import { Device, DeviceCategory } from '../../types/device';
import { Reading } from '../../types/reading';
import { useLiveDeviceStates } from '../../hooks/useLiveDevice';
import { normalizeMacAddress } from '../../services/liveDeviceService';

const GRAPH_H = 140;
const Y_W = 28;

const CATEGORY_RANGES: Record<DeviceCategory, string> = {
  freezer:   'Range: -20 to 0°C',
  fridge:    'Range: 2 to 8°C',
  cold_room: 'Range: 0 to 10°C',
  general:   'Range: 15 to 30°C',
};

const LINE_COLORS = ['#5C6BC0', '#06B6D4', '#F59E0B', '#22C55E', '#EF4444', '#A855F7'];

function getXLabels(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
  });
}

function getDailyAvgs(readings: Reading[]): (number | null)[] {
  const now = Date.now();
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = now - (6 - i) * 86400000;
    const dayEnd   = dayStart + 86400000;
    const vals = readings
      .filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd)
      .map(r => r.temperature);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
}

function fillNulls(arr: (number | null)[]): number[] {
  const filled = [...arr];
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] === null) filled[i] = filled[i - 1] ?? filled[i + 1] ?? 0;
  }
  return filled as number[];
}

// ── Combined category graph ───────────────────────────────────────────────────
function CategoryGraph({
  devices, readingsMap,
}: {
  devices: Device[];
  readingsMap: Record<string, Reading[]>;
}) {
  const [plotWidth, setPlotWidth] = useState(0);
  const xLabels = getXLabels();

  const seriesData = devices.map((d, idx) => ({
    device: d,
    data: fillNulls(getDailyAvgs(readingsMap[d.device_id] ?? [])),
    color: LINE_COLORS[idx % LINE_COLORS.length],
  }));

  // Global min/max across all devices + thresholds
  const allVals = seriesData.flatMap(s => [
    ...s.data,
    s.device.temp_high_threshold,
    s.device.temp_low_threshold,
  ]);
  const minV = Math.min(...allVals) - 2;
  const maxV = Math.max(...allVals) + 2;
  const range = maxV - minV || 1;
  const toY = (v: number) => GRAPH_H - ((v - minV) / range) * GRAPH_H;

  const yStep = (maxV - minV) / 4;
  const yLabels = Array.from({ length: 5 }, (_, i) => Math.round(maxV - i * yStep));

  // Collect unique threshold pairs to avoid duplicate lines
  const thresholds: { high: number; low: number; color: string }[] = [];
  seriesData.forEach(s => {
    const exists = thresholds.find(
      t => t.high === s.device.temp_high_threshold && t.low === s.device.temp_low_threshold
    );
    if (!exists) thresholds.push({ high: s.device.temp_high_threshold, low: s.device.temp_low_threshold, color: s.color });
  });

  return (
    <View style={gs.graphCard}>
      <Text style={gs.graphTitle}>Temperature Overview (Last 7 Days)</Text>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Y axis labels + line */}
        <View style={{ width: Y_W, height: GRAPH_H, justifyContent: 'space-between' }}>
          {yLabels.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
              <Text style={gs.yLabel}>{l}°</Text>
              <View style={gs.yTick} />
            </View>
          ))}
        </View>

        {/* Y axis vertical line + plot */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', height: GRAPH_H }}>
            {/* Y axis line */}
            <View style={gs.yAxisLine} />

            {/* Plot area */}
            <View
              style={{ flex: 1, height: GRAPH_H }}
              onLayout={e => setPlotWidth(e.nativeEvent.layout.width)}
            >
              {plotWidth > 0 && (
                <>
                  {yLabels.map((_, i) => (
                    <View key={i} style={[gs.gridLine, { top: (i / (yLabels.length - 1)) * GRAPH_H }]} />
                  ))}
                  {thresholds.map((t, i) => (
                    <React.Fragment key={i}>
                      <View style={[gs.threshLine, { top: toY(t.high), borderColor: '#EF4444' }]} />
                      <View style={[gs.threshLine, { top: toY(t.low), borderColor: '#3B82F6' }]} />
                    </React.Fragment>
                  ))}
                  {seriesData.map(s => {
                    const ptStep = plotWidth / (s.data.length - 1);
                    const pts = s.data.map((v, i) => ({ x: i * ptStep, y: toY(v) }));
                    return pts.slice(0, -1).map((p, i) => {
                      const nx = pts[i + 1];
                      const dx = nx.x - p.x; const dy = nx.y - p.y;
                      const len = Math.sqrt(dx * dx + dy * dy);
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      return (
                        <View key={`${s.device.device_id}-${i}`} style={{
                          position: 'absolute', left: p.x, top: p.y,
                          width: len, height: 2, backgroundColor: s.color,
                          transformOrigin: '0 50%',
                          transform: [{ rotate: `${angle}deg` }],
                        }} />
                      );
                    });
                  })}
                </>
              )}
            </View>
          </View>

          {/* X axis line */}
          <View style={gs.xAxisLine} />

          {/* X labels */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            {xLabels.map((l, i) => (
              <View key={i} style={{ alignItems: 'center' }}>
                <Text style={gs.xLabel}>{l}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Legend */}
      <View style={gs.legend}>
        <View style={gs.legendItem}>
          <View style={[gs.legendDash, { borderColor: '#EF4444' }]} />
          <Text style={gs.legendText}>High Threshold</Text>
        </View>
        <View style={gs.legendItem}>
          <View style={[gs.legendDash, { borderColor: '#3B82F6' }]} />
          <Text style={gs.legendText}>Low Threshold</Text>
        </View>
        {seriesData.map(s => (
          <View key={s.device.device_id} style={gs.legendItem}>
            <View style={[gs.legendLine, { backgroundColor: s.color }]} />
            <Text style={gs.legendText}>{s.device.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Device grid card ──────────────────────────────────────────────────────────
function DeviceCard({
  device, lastTemp, lastHumidity, isActive, onPress,
}: {
  device: Device;
  lastTemp: number | null;
  lastHumidity: number | null;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const tempColor = lastTemp === null ? '#D1D5DB'
    : lastTemp > device.temp_high_threshold ? '#EF4444'
    : lastTemp < device.temp_low_threshold  ? '#3B82F6'
    : '#22C55E';

  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, friction: 8 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, friction: 6 }).start()}
    >
      <Animated.View style={[dc.card, { transform: [{ scale }] }]}>
        {/* Header: name + status dot */}
        <View style={dc.topRow}>
          <Text style={dc.name} numberOfLines={1}>{device.name}</Text>
          <View style={[dc.dot, { backgroundColor: isActive ? '#22C55E' : '#D1D5DB' }]} />
        </View>

        {/* Temp + Humidity row */}
        <View style={dc.statsRow}>
          <View style={dc.statCol}>
            <View style={dc.metricRow}>
              <Ionicons name="thermometer-outline" size={11} color={tempColor} />
              <Text style={dc.metricLabel}>TEMP</Text>
            </View>
            <View style={dc.valueRow}>
              <Text style={[dc.valueBig, { color: tempColor }]}>
                {lastTemp !== null ? lastTemp.toFixed(1) : '--'}
              </Text>
              {lastTemp !== null && <Text style={dc.valueUnit}>°C</Text>}
            </View>
          </View>

          <View style={dc.statDivider} />

          <View style={dc.statCol}>
            <View style={dc.metricRow}>
              <Ionicons name="water-outline" size={11} color="#06B6D4" />
              <Text style={dc.metricLabel}>HUM</Text>
            </View>
            <View style={dc.valueRow}>
              <Text style={[dc.valueBig, { color: '#06B6D4' }]}>
                {lastHumidity !== null ? Math.round(lastHumidity) : '--'}
              </Text>
              {lastHumidity !== null && <Text style={dc.valueUnit}>%</Text>}
            </View>
          </View>
        </View>

        {/* Battery */}
        <View style={dc.batteryRow}>
          <Ionicons name="battery-half-outline" size={12} color="#9CA3AF" />
          <Text style={dc.battery}>
            {liveState?.battery != null ? `${liveState.battery}%` : device.battery_level != null ? `${device.battery_level}%` : '--'}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Category section ──────────────────────────────────────────────────────────
function CategorySection({
  category, devices, navigation, sectionIndex, liveStates,
}: {
  category: DeviceCategory;
  devices: Device[];
  navigation: any;
  sectionIndex: number;
  liveStates: Map<string, any>;
}) {
  const [readingsMap, setReadingsMap] = useState<Record<string, Reading[]>>({});
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay: sectionIndex * 120, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, delay: sectionIndex * 120, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    devices.forEach(d => {
      getReadingsByDevice(d.device_id, 100)
        .then(r => setReadingsMap(prev => ({ ...prev, [d.device_id]: r })))
        .catch(console.error);
    });
  }, [devices]);

  const label = category === 'cold_room' ? 'COLD ROOM'
    : category === 'general' ? 'GENERAL AREA'
    : category.toUpperCase();

  const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
  const activeCount = devices.filter(d => {
    const liveState = liveStates.get(normalizeMacAddress(d.mac_address));
    return liveState && Date.now() - liveState.updatedAt < ACTIVE_WINDOW_MS;
  }).length;

  // Pair devices into rows of 2
  const rows: Device[][] = [];
  for (let i = 0; i < devices.length; i += 2) {
    rows.push(devices.slice(i, i + 2));
  }

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Category header */}
      <View style={cs.catHeader}>
        <View>
          <Text style={cs.catLabel}>{label}</Text>
          <Text style={cs.catRange}>{CATEGORY_RANGES[category]}</Text>
        </View>
        {activeCount > 0 && (
          <View style={cs.activeBadge}>
            <View style={cs.activeDot} />
            <Text style={cs.activeText}>{activeCount} Active</Text>
          </View>
        )}
      </View>

      {/* Device grid */}
      <View style={cs.grid}>
        {rows.map((row, ri) => (
          <View key={ri} style={cs.gridRow}>
            {row.map(d => {
              const liveState = liveStates.get(normalizeMacAddress(d.mac_address));
              const lastTemp = liveState?.temperature ?? null;
              const lastHumidity = liveState?.humidity ?? null;
              const isActive = liveState?.updatedAt != null && Date.now() - liveState.updatedAt < ACTIVE_WINDOW_MS;
              return (
                <DeviceCard
                  key={d.device_id}
                  device={d}
                  lastTemp={lastTemp}
                  lastHumidity={lastHumidity}
                  isActive={isActive}
                  onPress={() => navigation.navigate('DeviceDetail', { deviceId: d.device_id })}
                />
              );
            })}
            {/* Fill empty slot if odd number */}
            {row.length === 1 && <View style={{ flex: 1 }} />}
          </View>
        ))}
      </View>

      {/* One combined graph for all devices in this category */}
      <CategoryGraph devices={devices} readingsMap={readingsMap} />
    </Animated.View>
  );
}

// ── Bell shake ────────────────────────────────────────────────────────────────
function useBellShake() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const shake = Animated.sequence([
      Animated.timing(anim, { toValue: 6,  duration: 60, useNativeDriver: true }),
      Animated.timing(anim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 4,  duration: 60, useNativeDriver: true }),
      Animated.timing(anim, { toValue: -4, duration: 60, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]);
    Animated.loop(Animated.sequence([shake, Animated.delay(5000)]), { iterations: -1 }).start();
  }, []);
  return anim;
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }: any) {
  const { devices } = useDevices();
  const liveStates = useLiveDeviceStates();
  const isEmpty = devices.length === 0;
  const bellShake   = useBellShake();
  const addBtnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isEmpty) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(addBtnScale, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(addBtnScale, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isEmpty]);

  const byCategory = (cat: DeviceCategory) => devices.filter(d => d.category === cat);
  const freezers     = byCategory('freezer');
  const fridges      = byCategory('fridge');
  const coldRooms    = byCategory('cold_room');
  const generalAreas = byCategory('general');

  return (
    <SafeAreaView style={ms.container} edges={['top']}>
      {/* Top bar */}
      <View style={ms.topBar}>
        <Image source={require('../../../assets/Kumva-New-Logo-D.png')} style={ms.logo} resizeMode="contain" />
        <Text style={ms.appTitle}>Kumva Insights</Text>
        <View style={ms.topRight}>
          {!isEmpty && (
            <Pressable
              style={ms.addBtn}
              onPress={() => navigation.navigate('AddDevice')}
              onPressIn={() => Animated.spring(addBtnScale, { toValue: 0.9, useNativeDriver: true, friction: 8 }).start()}
              onPressOut={() => Animated.spring(addBtnScale, { toValue: 1,  useNativeDriver: true, friction: 6 }).start()}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          )}
          <TouchableOpacity
            style={ms.bellBtn}
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={0.7}
          >
            <Animated.View style={{ transform: [{ translateX: bellShake }] }}>
              <Ionicons name="notifications-outline" size={20} color="#1C1C1E" />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      {isEmpty ? (
        <View style={ms.emptyWrap}>
          <View style={ms.iconCircle}>
            <View style={ms.noSignal}>
              <View style={ms.diagLine} />
              <View style={[ms.arc, { width: 52, height: 52, borderRadius: 26, top: 14, left: 14 }]} />
              <View style={[ms.arc, { width: 34, height: 34, borderRadius: 17, top: 23, left: 23 }]} />
              <View style={[ms.arc, { width: 16, height: 16, borderRadius: 8,  top: 32, left: 32 }]} />
            </View>
          </View>
          <Text style={ms.emptyTitle}>No devices added yet</Text>
          <Text style={ms.emptySubtitle}>
            Start monitoring your storage environment{'\n'}
            by connecting your first BLE sensor.
          </Text>
          <Pressable
            style={ms.addDeviceBtnWrap}
            onPress={() => navigation.navigate('AddDevice')}
            onPressIn={() => Animated.spring(addBtnScale, { toValue: 0.96, useNativeDriver: true, friction: 8 }).start()}
            onPressOut={() => Animated.spring(addBtnScale, { toValue: 1,    useNativeDriver: true, friction: 6 }).start()}
          >
            <Animated.View style={[ms.addDeviceBtn, { transform: [{ scale: addBtnScale }] }]}>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={ms.addDeviceBtnText}>Add Device</Text>
            </Animated.View>
          </Pressable>
          <Text style={ms.footer}>CONNECTED INFRASTRUCTURE STARTS HERE</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={ms.scroll} showsVerticalScrollIndicator={false}>
          {freezers.length     > 0 && <CategorySection category="freezer"   devices={freezers}     navigation={navigation} sectionIndex={0} liveStates={liveStates} />}
          {fridges.length      > 0 && <CategorySection category="fridge"    devices={fridges}      navigation={navigation} sectionIndex={1} liveStates={liveStates} />}
          {coldRooms.length    > 0 && <CategorySection category="cold_room" devices={coldRooms}    navigation={navigation} sectionIndex={2} liveStates={liveStates} />}
          {generalAreas.length > 0 && <CategorySection category="general"   devices={generalAreas} navigation={navigation} sectionIndex={3} liveStates={liveStates} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F4F6FB' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  logo:       { width: 48, height: 32 },
  appTitle:   { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  topRight:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: '#5C6BC0', alignItems: 'center', justifyContent: 'center' },
  bellBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F4F6FB', alignItems: 'center', justifyContent: 'center' },
  scroll:     { paddingBottom: 48 },
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  iconCircle: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#E8EAF6', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  noSignal:   { width: 80, height: 80, position: 'relative' },
  diagLine:   { position: 'absolute', width: 2, height: 90, backgroundColor: '#5C6BC0', top: -5, left: 39, transform: [{ rotate: '-45deg' }], zIndex: 2 },
  arc:        { position: 'absolute', borderWidth: 3, borderColor: '#5C6BC0', borderBottomColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1C1C1E', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  addDeviceBtnWrap: { alignSelf: 'stretch', marginTop: 8 },
  addDeviceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#5C6BC0', borderRadius: 14, paddingVertical: 16,
    shadowColor: '#5C6BC0', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  addDeviceBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footer:     { fontSize: 10, color: '#9CA3AF', letterSpacing: 1.2, fontWeight: '600', marginTop: 8 },
});

const cs = StyleSheet.create({
  catHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingTop: 24, paddingBottom: 12,
  },
  catLabel:    { fontSize: 13, fontWeight: '800', color: '#1C1C1E', letterSpacing: 0.6 },
  catRange:    { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF0FB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  activeDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  activeText:  { fontSize: 11, color: '#5C6BC0', fontWeight: '600' },
  grid:        { paddingHorizontal: 16, gap: 10 },
  gridRow:     { flexDirection: 'row', gap: 10 },
});

const dc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  topRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  name:        { fontSize: 12, fontWeight: '700', color: '#1C1C1E', flex: 1, marginRight: 4 },
  dot:         { width: 8, height: 8, borderRadius: 4 },
  statsRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statCol:     { flex: 1 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: '#E5E7EB', marginHorizontal: 10 },
  metricRow:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  metricLabel: { fontSize: 9, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.4 },
  valueRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  valueBig:    { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  valueUnit:   { fontSize: 11, fontWeight: '600', color: '#6B7280', marginBottom: 1 },
  batteryRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  battery:     { fontSize: 11, color: '#9CA3AF' },
});

const gs = StyleSheet.create({
  graphCard: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 24,
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  graphTitle:  { fontSize: 13, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 },
  // Y axis
  yLabel:     { fontSize: 9, color: '#9CA3AF', textAlign: 'right', minWidth: 22 },
  yTick:      { width: 4, height: 1, backgroundColor: '#9CA3AF', marginLeft: 2 },
  yAxisLine:  { width: 1.5, height: GRAPH_H, backgroundColor: '#9CA3AF' },
  // Plot
  gridLine:   { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
  threshLine: { position: 'absolute', left: 0, right: 0, height: 1, borderTopWidth: 1, borderStyle: 'dashed' },
  // X axis
  xAxisLine:  { height: 1.5, backgroundColor: '#9CA3AF' },
  xLabel:     { fontSize: 8, color: '#9CA3AF', textAlign: 'center' },
  // Legend
  legend:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDash: { width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
  legendLine: { width: 14, height: 2, borderRadius: 1 },
  legendText: { fontSize: 9, color: '#6B7280' },
});
