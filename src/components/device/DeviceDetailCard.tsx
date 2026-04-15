import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Device } from '../../types/device';

interface DeviceDetailCardProps {
  device: Device;
  currentTemp?: number;
}

export default function DeviceDetailCard({ device, currentTemp }: DeviceDetailCardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.name}>{device.name}</Text>
      {currentTemp !== undefined && <Text style={styles.temp}>{currentTemp}°C</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', borderRadius: 12 },
  name: { fontSize: 18, fontWeight: '700' },
  temp: { fontSize: 32, fontWeight: '800', color: '#007AFF', marginTop: 8 },
});
