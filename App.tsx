import React, { useEffect, useState, Component } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { initDb } from './src/database/db';
import { requestNotificationPermissions } from './src/services/notificationService';
import { checkAllStatus, requestPermissions } from './src/utils/permissions';
import { onScanResult, onConnState, startScan, stopScan } from './src/services/bluetoothService';
import { setLiveSensorState } from './src/services/liveDeviceService';
import { startAutoSync, stopAutoSync } from './src/services/autoSyncService';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <View style={s.err}>
          <Text style={s.errTitle}>Something went wrong</Text>
          <Text style={s.errMsg}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDb()
      .then(() => requestNotificationPermissions().catch(() => {}))
      .then(() => setReady(true))
      .catch(e => setError(e?.message ?? 'DB init failed'));
  }, []);

  useEffect(() => {
    let active = true;
    let scanSub: any;
    let connSub: any;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    // Per SDK docs: scan ~90s, then stop and restart to keep scanning
    function doStartScan() {
      if (!active) return;
      if (restartTimer) clearTimeout(restartTimer);
      startScan();
      restartTimer = setTimeout(() => {
        if (active) doStartScan();
      }, 90_000);
    }

    async function init() {
      try {
        const status = await checkAllStatus();
        if (status !== 'granted') {
          const req = await requestPermissions();
          if (req !== 'granted') return;
        }
        if (!active) return;

        // Feed live state from every scan result
        scanSub = onScanResult((devices: any[]) => {
          devices?.forEach(d => {
            if (!d?.mac) return;
            setLiveSensorState(d.mac, {
              temperature: d.temperature,
              humidity: d.humidity,
              battery: d.battery,
            });
          });
        });

        // SDK stops scan when connect() is called — restart after disconnect
        connSub = onConnState((event: any) => {
          if (!active) return;
          if (event?.state === 'disconnected' || event?.state === 'firmware_upgrade_success') {
            doStartScan();
          }
        });

        doStartScan();
      } catch (e) {
        console.error('BLE init failed', e);
      }
    }

    init();

    return () => {
      active = false;
      if (restartTimer) clearTimeout(restartTimer);
      scanSub?.remove?.();
      connSub?.remove?.();
      stopScan();
    };
  }, []);

  if (error) {
    return (
      <View style={s.err}>
        <Text style={s.errTitle}>Startup Error</Text>
        <Text style={s.errMsg}>{error}</Text>
      </View>
    );
  }

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  err: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  errTitle: { fontSize: 18, fontWeight: '700', color: '#DC2626', marginBottom: 8 },
  errMsg: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
});
