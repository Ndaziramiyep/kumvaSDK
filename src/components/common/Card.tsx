import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';

export default function Card({ children, style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
});
