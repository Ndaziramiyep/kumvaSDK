import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import Button from '../common/Button';

interface DeviceConfigFormProps {
  initialName?: string;
  onSubmit: (name: string, minTemp: number, maxTemp: number) => void;
}

export default function DeviceConfigForm({ initialName = '', onSubmit }: DeviceConfigFormProps) {
  const [name, setName] = useState(initialName);
  const [minTemp, setMinTemp] = useState('');
  const [maxTemp, setMaxTemp] = useState('');

  return (
    <View style={styles.container}>
      <TextInput style={styles.input} placeholder="Device name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Min temp (°C)" value={minTemp} onChangeText={setMinTemp} keyboardType="numeric" />
      <TextInput style={styles.input} placeholder="Max temp (°C)" value={maxTemp} onChangeText={setMaxTemp} keyboardType="numeric" />
      <Button label="Save" onPress={() => onSubmit(name, Number(minTemp), Number(maxTemp))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10 },
});
