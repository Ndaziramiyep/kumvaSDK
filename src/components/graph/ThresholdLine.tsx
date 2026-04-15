import React from 'react';
import { View, StyleSheet } from 'react-native';

interface ThresholdLineProps {
  color?: string;
}

export default function ThresholdLine({ color = '#FF3B30' }: ThresholdLineProps) {
  return <View style={[styles.line, { borderColor: color }]} />;
}

const styles = StyleSheet.create({
  line: { borderTopWidth: 1, borderStyle: 'dashed', width: '100%' },
});
