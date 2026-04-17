import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, Camera } from 'expo-camera';
import { useAppStore } from '../../store/store';
import { getAllDevices } from '../../database/repositories/deviceRepository';
import { getLiveSensorState, normalizeMacAddress } from '../../services/liveDeviceService';
import { onScanResult } from '../../services/bluetoothService';

const MAC_PATTERN = /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$|^[0-9A-Fa-f]{12}$/;

function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase().replace(/[:\-]/g, '');
}

function formatMac(raw: string): string {
  const clean = normalizeMac(raw);
  return clean.match(/.{1,2}/g)?.join(':') ?? raw;
}

export default function ScannerScreen({ navigation }: any) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const scanLock = useRef(false);
  const bleNames = useRef<Map<string, string>>(new Map()); // mac -> sensor name
  const storeDevices = useAppStore(s => s.devices);

  useEffect(() => {
    Camera.requestCameraPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted');
    });

    // Cache BLE-broadcast names as sensors are discovered
    const sub = onScanResult((devices: any[]) => {
      devices?.forEach((d: any) => {
        if (d?.mac && d?.name) {
          bleNames.current.set(normalizeMacAddress(d.mac), d.name);
        }
      });
    });
    return () => sub?.remove?.();
  }, []);

  // ── Check if MAC is already registered ──────────────────────────────────────
  const isAlreadyRegistered = async (mac: string): Promise<boolean> => {
    const normalized = normalizeMac(mac);
    // Check Zustand store first (fast)
    const inStore = storeDevices.some(
      d => normalizeMac(d.mac_address) === normalized
    );
    if (inStore) return true;
    // Then check DB (catches previous sessions)
    const dbDevices = await getAllDevices();
    return dbDevices.some(d => normalizeMac(d.mac_address) === normalized);
  };

  // ── QR code scanned ──────────────────────────────────────────────────────────
  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanLock.current) return;

    const trimmed = data.trim();
    if (!MAC_PATTERN.test(trimmed)) {
      scanLock.current = true;
      setScanned(true);
      Alert.alert(
        'Invalid QR Code',
        'The QR code must contain a Minew device MAC address (e.g. AA:BB:CC:DD:EE:FF).',
        [{ text: 'Try Again', onPress: () => { setScanned(false); scanLock.current = false; } }]
      );
      return;
    }

    scanLock.current = true;
    setScanned(true);

    const mac = formatMac(trimmed);
    const already = await isAlreadyRegistered(trimmed);
    if (already) {
      Alert.alert(
        'Already Registered',
        `Device with MAC ${mac} is already registered.`,
        [{ text: 'OK', onPress: () => { setScanned(false); scanLock.current = false; } }]
      );
      return;
    }

    // Look up the BLE-broadcast name for this MAC (from live scan results)
    const normalizedMac = normalizeMacAddress(trimmed);
    const bleName = bleNames.current.get(normalizedMac)
      ?? getLiveSensorState(trimmed)?.mac  // fallback: check live state
      ?? '';

    navigation.navigate('DeviceConfig', {
      scannedDevice: { name: bleName, macAddress: mac, category: 'freezer' },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Onboard Device</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* Viewfinder */}
        <View style={styles.viewfinderWrap}>
          {hasPermission === true ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <View style={styles.qrIcon}>
                <View style={styles.qrRow}>
                  <View style={styles.qrCell} /><View style={styles.qrCellEmpty} /><View style={styles.qrCell} />
                </View>
                <View style={styles.qrRow}>
                  <View style={styles.qrCellEmpty} /><View style={styles.qrCell} /><View style={styles.qrCellEmpty} />
                </View>
                <View style={styles.qrRow}>
                  <View style={styles.qrCell} /><View style={styles.qrCellEmpty} /><View style={styles.qrCell} />
                </View>
              </View>
            </View>
          )}

          {/* Corner brackets */}
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />

          {/* Scan line animation hint */}
          {hasPermission === true && !scanned && (
            <View style={styles.scanLine} />
          )}
        </View>

        <Text style={styles.title}>Scan device QR code</Text>
        <Text style={styles.subtitle}>
          Align the QR code on your Minew sensor{'\n'}
          within the frame to register it.
        </Text>

        {hasPermission === false && (
          <View style={styles.permissionBox}>
            <Ionicons name="camera-outline" size={18} color="#EF4444" />
            <Text style={styles.permissionNote}>
              Camera permission denied. Enable it in Settings to scan QR codes.
            </Text>
          </View>
        )}

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => navigation.navigate('DeviceConfig', { scannedDevice: null })}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={18} color="#5C6BC0" />
          <Text style={styles.manualBtnText}>Enter details manually</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const CORNER_SIZE = 28;
const CORNER_BORDER = 3;
const CORNER_COLOR = '#5C6BC0';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2FA' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F0F2FA',
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },

  body: {
    flex: 1, alignItems: 'center',
    paddingHorizontal: 32, paddingTop: 32, gap: 20,
  },

  viewfinderWrap: {
    width: 260, height: 260, borderRadius: 20,
    overflow: 'hidden', backgroundColor: '#1C1C1E',
    position: 'relative',
  },
  camera: { width: '100%', height: '100%' },
  cameraPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  qrIcon: { gap: 4 },
  qrRow: { flexDirection: 'row', gap: 4 },
  qrCell: { width: 20, height: 20, backgroundColor: '#8B9BE8', borderRadius: 3 },
  qrCellEmpty: { width: 20, height: 20 },

  // Scan line
  scanLine: {
    position: 'absolute', left: 12, right: 12,
    top: '50%', height: 2,
    backgroundColor: '#5C6BC0', opacity: 0.8,
    borderRadius: 1,
  },

  // Corner brackets
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: CORNER_COLOR },
  tl: { top: 0, left: 0, borderTopWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderTopWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderBottomWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderBottomWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderBottomRightRadius: 4 },

  title: { fontSize: 20, fontWeight: '800', color: '#1C1C1E', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginTop: -8 },

  permissionBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12,
    alignSelf: 'stretch',
  },
  permissionNote: { flex: 1, fontSize: 13, color: '#EF4444', lineHeight: 18 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },

  manualBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16,
    alignSelf: 'stretch',
    borderWidth: 1.5, borderColor: '#5C6BC0',
  },
  manualBtnText: { color: '#5C6BC0', fontSize: 16, fontWeight: '700' },
});
