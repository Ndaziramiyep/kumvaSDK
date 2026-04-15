import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const FILTERS = ['Today', 'Week', 'Month'];

interface FilterBarProps {
  selected: string;
  onSelect: (filter: string) => void;
}

export default function FilterBar({ selected, onSelect }: FilterBarProps) {
  return (
    <View style={styles.row}>
      {FILTERS.map(f => (
        <TouchableOpacity key={f} style={[styles.chip, selected === f && styles.active]} onPress={() => onSelect(f)}>
          <Text style={[styles.label, selected === f && styles.activeLabel]}>{f}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0F0F0' },
  active: { backgroundColor: '#007AFF' },
  label: { color: '#333' },
  activeLabel: { color: '#fff' },
});
