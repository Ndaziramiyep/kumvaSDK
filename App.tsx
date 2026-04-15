import React, { useEffect, useState, Component } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { initDb } from './src/database/db';
import { requestNotificationPermissions } from './src/services/notificationService';

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
