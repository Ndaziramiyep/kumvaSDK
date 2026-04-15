import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Device } from '../../types/device';

interface DeviceWidgetProps {
  device: Device;
}

export default function DeviceWidget({ device }: DeviceWidgetProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.name}>{device.name}</Text>
      <Text style={styles.category}>{device.category}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, borderRadius: 8, backgroundColor: '#F0F4FF' },
  name: { fontWeight: '600', fontSize: 16 },
  category: { color: '#666', fontSize: 13 },
});
