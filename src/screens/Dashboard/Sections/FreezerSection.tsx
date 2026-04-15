import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function FreezerSection() {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Freezers</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { margin: 16 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
});
