import React from 'react';
import { View, StyleSheet } from 'react-native';
import Header from '../../components/common/Header';
import Button from '../../components/common/Button';

export default function AddDeviceScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Header title="Add Device" />
      <View style={styles.body}>
        <Button label="Scan for Devices" onPress={() => navigation.navigate('Scanner')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 20, gap: 12 },
});
