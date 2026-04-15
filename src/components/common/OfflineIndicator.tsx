import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface OfflineIndicatorProps {
  visible: boolean;
}

export default function OfflineIndicator({ visible }: OfflineIndicatorProps) {
  if (!visible) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#FF3B30', padding: 8, alignItems: 'center' },
  text: { color: '#fff', fontSize: 13 },
});
