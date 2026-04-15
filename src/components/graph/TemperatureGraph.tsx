import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Reading } from '../../types/reading';

interface TemperatureGraphProps {
  readings: Reading[];
}

export default function TemperatureGraph({ readings }: TemperatureGraphProps) {
  // Placeholder — replace with a charting library (e.g. victory-native)
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Temperature Graph ({readings.length} readings)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 200, backgroundColor: '#F8F9FA', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  label: { color: '#999' },
});
