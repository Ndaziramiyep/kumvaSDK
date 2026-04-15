import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { startScan, stopScan, onScanResult } from '../../services/bluetoothService';
import { checkAllStatus, requestPermissions } from '../../utils/permissions';
import { CameraView, Camera } from 'expo-camera';

interface BleAdvertisement {
  name: string;
  macAddress: string;
  category?: string;
}

const MAC_PATTERN = /^[0-9A-Fa-f]{12}$|^[0-9A-Fa-f:]{11,17}$/;

function parseDevicePayload(data: string): BleAdvertisement | null {
  const trimmed = data.trim();
  if (MAC_PATTERN.test(trimmed)) {
    return { name: '', macAddress: trimmed };
  }
  return null;
}

function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase();
}

export default function ScannerScreen({ navigation }: any) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [manualMac, setManualMac] = useState('');
  const scanLock = useRef(false);
  const scanActive = useRef(false);
  const scanSubscription = useRef<any>(null);
  const scanTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    async function startBleScan() {
      const status = await checkAllStatus();
      if (!active) return;
      if (status !== 'granted') {
        const requested = await requestPermissions();
        if (!active) return;
        if (requested !== 'granted') {
          setHasPermission(false);
          return;
        }
      }

      setHasPermission(true);
      try {
        startScan();
        scanActive.current = true;

        scanSubscription.current = onScanResult((devices: any[]) => {
          if (!active || scanLock.current) return;
          if (!devices?.length) return;

          const found = devices.find(device => device.mac && device.temperature != null);
          if (!found) return;

          scanLock.current = true;
          setScanned(true);
          stopScan();
          scanActive.current = false;
          if (scanTimeout.current) {
            clearTimeout(scanTimeout.current);
            scanTimeout.current = null;
          }

          navigation.navigate('DeviceConfig', {
            scannedDevice: {
              name: found.name ?? 'Minew Sensor',
              macAddress: found.mac,
              category: 'freezer',
            },
          });
        });

        scanTimeout.current = setTimeout(() => {
          if (scanActive.current) {
            stopScan();
            scanActive.current = false;
          }
        }, 90000);
      } catch {
        // ignore scan startup failures; camera fallback still works
      }
    }

    startBleScan();

    Camera.requestCameraPermissionsAsync().then(({ status }) => {
      if (!active) return;
      setHasPermission(status === 'granted');
    });

    return () => {
      active = false;
      if (scanActive.current) {
        stopScan();
        scanActive.current = false;
      }
      if (scanSubscription.current?.remove) {
        scanSubscription.current.remove();
      }
      if (scanTimeout.current) {
        clearTimeout(scanTimeout.current);
        scanTimeout.current = null;
      }
    };
  }, [navigation]);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanned(true);
    if (scanActive.current) {
      stopScan();
      scanActive.current = false;
    }
    if (scanTimeout.current) {
      clearTimeout(scanTimeout.current);
      scanTimeout.current = null;
    }

    const parsed = parseDevicePayload(data);
    if (parsed && parsed.macAddress) {
      navigation.navigate('DeviceConfig', {
        scannedDevice: {
          name: '',
          macAddress: normalizeMac(parsed.macAddress),
          category: 'freezer',
        },
      });
      return;
    }

    Alert.alert(
      'Invalid QR Code',
      'Expected format: a Minew device MAC address like AA:BB:CC:DD:EE:FF',
      [{
        text: 'Try Again',
        onPress: () => { setScanned(false); scanLock.current = false; },
      }]
    );
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
        {/* Camera viewfinder box */}
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
              {/* QR placeholder icon */}
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
        </View>

        {/* Text */}
        <Text style={styles.title}>Scan device QR code</Text>
        <Text style={styles.subtitle}>
          Align the QR code within the frame to start{'\n'}pairing with your network.
        </Text>

        {hasPermission === false && (
          <Text style={styles.permissionNote}>Camera permission denied. Enable it in Settings.</Text>
        )}

        {/* Manual MAC entry */}
        <Text style={styles.label}>Enter MAC address</Text>
        <TextInput
          style={styles.input}
          placeholder="AA:BB:CC:DD:EE:FF"
          placeholderTextColor="#B0B8C8"
          value={manualMac}
          onChangeText={setManualMac}
          autoCapitalize="characters"
        />
        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => {
            const normalized = normalizeMac(manualMac);
            if (!MAC_PATTERN.test(normalized)) {
              Alert.alert('Invalid MAC', 'Please enter a valid MAC address like AA:BB:CC:DD:EE:FF.');
              return;
            }
            navigation.navigate('DeviceConfig', {
              scannedDevice: {
                name: '',
                macAddress: normalized,
                category: 'freezer',
              },
            });
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.manualBtnText}>Use MAC and Configure</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.manualBtnSecondary}
          onPress={() => navigation.navigate('DeviceConfig', { scannedDevice: null })}
          activeOpacity={0.85}
        >
          <Text style={styles.manualBtnTextSecondary}>Register device manually</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F0F2FA',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  backIcon: { fontSize: 24, color: '#1C1C1E', lineHeight: 28 },  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },

  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 32,
    gap: 20,
  },

  viewfinderWrap: {
    width: 240,
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E5F0',
    position: 'relative',
  },
  camera: { width: '100%', height: '100%' },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E5F0',
  },

  // Simple QR placeholder icon
  qrIcon: { gap: 4 },
  qrRow: { flexDirection: 'row', gap: 4 },
  qrCell: { width: 18, height: 18, backgroundColor: '#B0B8D0', borderRadius: 2 },
  qrCellEmpty: { width: 18, height: 18 },

  // Corner brackets overlaid on top of camera
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: CORNER_COLOR,
  },
  tl: { top: 0, left: 0, borderTopWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderTopWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderBottomWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderBottomWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderBottomRightRadius: 4 },

  title: { fontSize: 20, fontWeight: '800', color: '#1C1C1E', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  permissionNote: { fontSize: 12, color: '#EF4444', textAlign: 'center' },

  manualBtn: {
    backgroundColor: '#5C6BC0',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#5C6BC0',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  manualBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
