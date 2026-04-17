import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { insertDevice, getAllDevices, updateDevice } from '../../database/repositories/deviceRepository';
import { getReadyDb } from '../../database/db';
import { useAppStore } from '../../store/store';
import { Device, DeviceCategory } from '../../types/device';
import { syncSingleDevice } from '../../services/autoSyncService';
import { saveSecretKey, getSecretKey } from '../../services/secretKeyService';
import { connect, disConnect, onConnState } from '../../services/bluetoothService';

const CATEGORIES: { label: string; value: DeviceCategory }[] = [
  { label: 'Freezer', value: 'freezer' },
  { label: 'Fridge', value: 'fridge' },
  { label: 'Cold Room', value: 'cold_room' },
  { label: 'General Area', value: 'general' },
];

const CATEGORY_DEFAULTS: Record<DeviceCategory, { low: number; high: number }> = {
  freezer:   { low: -20, high: 0  },
  fridge:    { low: 2,   high: 8  },
  cold_room: { low: 0,   high: 10 },
  general:   { low: 15,  high: 30 },
};

const LIMIT = 5;

function clampThreshold(value: string, defaultVal: number): string {
  const n = parseFloat(value);
  if (isNaN(n)) return value;
  const min = defaultVal - LIMIT;
  const max = defaultVal + LIMIT;
  if (n < min) return String(min);
  if (n > max) return String(max);
  return value;
}

function isOutOfRange(value: string, defaultVal: number): boolean {
  const n = parseFloat(value);
  if (isNaN(n)) return false;
  return n < defaultVal - LIMIT || n > defaultVal + LIMIT;
}

export default function DeviceConfigScreen({ navigation, route }: any) {
  const addDevice = useAppStore(s => s.addDevice);
  const updateDeviceStore = useAppStore(s => s.updateDevice);
  const existingDevices = useAppStore(s => s.devices);
  const scanned = route.params?.scannedDevice as { name: string; macAddress: string; category?: string } | null;
  const isReconfigure: boolean = route.params?.isReconfigure ?? false;
  const deviceId: string | undefined = route.params?.deviceId;

  const initialCategory = (scanned?.category as DeviceCategory) ?? 'freezer';
  const [name, setName] = useState(
    isReconfigure && existingDevice ? existingDevice.name : (scanned?.name ?? '')
  );
  const sensorName = scanned?.name ?? ''; // original BLE-broadcast name
  const [macAddress, setMacAddress] = useState(scanned?.macAddress ?? '');
  const [category, setCategory] = useState<DeviceCategory>(initialCategory);
  const existingDevice = existingDevices.find(d => d.device_id === deviceId);
  const [highThreshold, setHighThreshold] = useState(
    isReconfigure && existingDevice ? String(existingDevice.temp_high_threshold) : String(CATEGORY_DEFAULTS[initialCategory].high)
  );
  const [lowThreshold, setLowThreshold] = useState(
    isReconfigure && existingDevice ? String(existingDevice.temp_low_threshold) : String(CATEGORY_DEFAULTS[initialCategory].low)
  );
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secretKey, setSecretKey] = useState(
    isReconfigure && existingDevice?.secret_key ? existingDevice.secret_key : getSecretKey
  );
  const [keyVisible, setKeyVisible] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Device Name Required', 'Please enter a name for this device.');
      return;
    }
    const trimmedMac = macAddress.trim().toUpperCase();
    if (!trimmedMac) {
      Alert.alert('MAC Address Required', 'Please enter the device MAC address.');
      return;
    }
    const trimmedKey = secretKey.trim();
    if (!trimmedKey) {
      Alert.alert('Secret Key Required', 'Please enter the device secret key to authenticate.');
      return;
    }

    // Validate thresholds within ±5 of category defaults
    const defaults = CATEGORY_DEFAULTS[category];
    if (isOutOfRange(highThreshold, defaults.high)) {
      Alert.alert(
        'Invalid High Threshold',
        `High threshold must be between ${defaults.high - LIMIT}°C and ${defaults.high + LIMIT}°C for this category.`
      );
      return;
    }
    if (isOutOfRange(lowThreshold, defaults.low)) {
      Alert.alert(
        'Invalid Low Threshold',
        `Low threshold must be between ${defaults.low - LIMIT}°C and ${defaults.low + LIMIT}°C for this category.`
      );
      return;
    }

    setSaving(true);
    try {
      if (isReconfigure && existingDevice) {
        const updated: Device = {
          ...existingDevice,
          name: trimmedName,
          category,
          temp_low_threshold: Number(lowThreshold),
          temp_high_threshold: Number(highThreshold),
          secret_key: trimmedKey,
        };
        await updateDevice(updated);
        updateDeviceStore(updated);
        await saveSecretKey(trimmedKey);
        // Propagate new name to incidents table
        try {
          const db = await getReadyDb();
          await db.runAsync(
            'UPDATE incidents SET device_name = ? WHERE device_id = ?',
            trimmedName, existingDevice.device_id
          );
        } catch (_) {}
        navigation.goBack();
        return;
      }

      // Check duplicate in Zustand store
      const duplicateInStore = existingDevices.find(
        d => d.mac_address.toUpperCase() === trimmedMac
      );
      if (duplicateInStore) {
        Alert.alert('Device Already Registered', `MAC address ${trimmedMac} is already registered as "${duplicateInStore.name}".`);
        setSaving(false);
        return;
      }

      // Check duplicate in DB
      const dbDevices = await getAllDevices();
      const duplicateInDb = dbDevices.find(d => d.mac_address.toUpperCase() === trimmedMac);
      if (duplicateInDb) {
        Alert.alert('Device Already Registered', `MAC address ${trimmedMac} is already registered as "${duplicateInDb.name}".`);
        setSaving(false);
        return;
      }

      // ── Validate secret key by attempting a real BLE connection ──────────
      await saveSecretKey(trimmedKey);
      const keyValid = await new Promise<boolean>(resolve => {
        let sub: any;
        const timer = setTimeout(() => { sub?.remove?.(); resolve(false); }, 20000);
        sub = onConnState((event: any) => {
          if ((event?.mac ?? '').toUpperCase() !== trimmedMac) return;
          if (event.state === 'connected_complete') {
            clearTimeout(timer); sub?.remove?.();
            disConnect(trimmedMac);
            resolve(true);
          } else if (event.state === 'password_error') {
            clearTimeout(timer); sub?.remove?.();
            disConnect(trimmedMac);
            resolve(false);
          }
        });
        connect(trimmedMac);
      });

      if (!keyValid) {
        Alert.alert('Invalid Secret Key', 'The secret key does not match this device. Please check and try again.');
        setSaving(false);
        return;
      }

      const device: Device = {
        device_id: Date.now().toString(),
        name: trimmedName,
        category,
        mac_address: trimmedMac,
        temp_low_threshold: Number(lowThreshold),
        temp_high_threshold: Number(highThreshold),
        battery_level: null,
        last_sync: null,
        secret_key: trimmedKey,
        created_at: Date.now(),
      };

      await insertDevice(device);
      addDevice(device);

      // Kick off an immediate background sync
      syncSingleDevice(device).catch(console.error);

      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e: any) {
      if (e?.message === 'DUPLICATE_MAC') {
        Alert.alert('Device Already Registered', `MAC address ${macAddress.trim().toUpperCase()} is already in use.`);
      } else {
        Alert.alert('Error', 'Failed to save device. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedLabel = CATEGORIES.find(c => c.value === category)?.label ?? 'Freezer';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configure Device</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Ionicons name="bluetooth-outline" size={22} color="#5C6BC0" />
          </View>
          <Text style={styles.bannerText}>New Device Found</Text>
        </View>

        <Text style={styles.label}>DEVICE NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Main Freezer 01"
          placeholderTextColor="#B0B8C8"
          value={name}
          onChangeText={setName}
        />
        {sensorName ? (
          <View style={styles.sensorNameHint}>
            <Ionicons name="bluetooth-outline" size={13} color="#5C6BC0" />
            <Text style={styles.sensorNameHintText}>Sensor broadcasts as: <Text style={styles.sensorNameHintBold}>{sensorName}</Text></Text>
          </View>
        ) : null}

        <Text style={styles.label}>MAC ADDRESS</Text>
        <TextInput
          style={[styles.input, !!scanned?.macAddress && styles.inputReadonly]}
          placeholder="e.g. AA:BB:CC:DD:EE:FF"
          placeholderTextColor="#B0B8C8"
          value={macAddress}
          onChangeText={setMacAddress}
          autoCapitalize="characters"
          editable={!scanned?.macAddress}
        />

        <Text style={styles.label}>SECRET KEY</Text>
        <View style={styles.secretRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Enter device secret key"
            placeholderTextColor="#B0B8C8"
            value={secretKey}
            onChangeText={setSecretKey}
            secureTextEntry={!keyVisible}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setKeyVisible(v => !v)}>
            <Ionicons name={keyVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>CATEGORY</Text>
        <TouchableOpacity
          style={styles.select}
          onPress={() => setShowCategoryPicker(v => !v)}
          activeOpacity={0.8}
        >
          <Text style={styles.selectText}>{selectedLabel}</Text>
          <Text style={styles.chevron}>{showCategoryPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showCategoryPicker && (
          <View style={styles.dropdown}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.value}
                style={[styles.dropdownItem, c.value === category && styles.dropdownItemActive]}
                onPress={() => {
                  setCategory(c.value);
                  setHighThreshold(String(CATEGORY_DEFAULTS[c.value].high));
                  setLowThreshold(String(CATEGORY_DEFAULTS[c.value].low));
                  setShowCategoryPicker(false);
                }}
              >
                <Text style={[styles.dropdownText, c.value === category && styles.dropdownTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.thresholdRow}>
          <View style={styles.thresholdCol}>
            <Text style={styles.label}>HIGH THRESHOLD</Text>
            <View style={[styles.thresholdInput, isOutOfRange(highThreshold, CATEGORY_DEFAULTS[category].high) && styles.thresholdInputError]}>
              <TextInput
                style={styles.thresholdValue}
                value={highThreshold}
                onChangeText={setHighThreshold}
                onBlur={() => setHighThreshold(clampThreshold(highThreshold, CATEGORY_DEFAULTS[category].high))}
                keyboardType="numeric"
              />
              <Text style={styles.unit}>°C</Text>
            </View>
            <Text style={styles.thresholdHint}>
              {CATEGORY_DEFAULTS[category].high - LIMIT}° to {CATEGORY_DEFAULTS[category].high + LIMIT}°C
            </Text>
          </View>
          <View style={styles.thresholdCol}>
            <Text style={styles.label}>LOW THRESHOLD</Text>
            <View style={[styles.thresholdInput, isOutOfRange(lowThreshold, CATEGORY_DEFAULTS[category].low) && styles.thresholdInputError]}>
              <TextInput
                style={styles.thresholdValue}
                value={lowThreshold}
                onChangeText={setLowThreshold}
                onBlur={() => setLowThreshold(clampThreshold(lowThreshold, CATEGORY_DEFAULTS[category].low))}
                keyboardType="numeric"
              />
              <Text style={styles.unit}>°C</Text>
            </View>
            <Text style={styles.thresholdHint}>
              {CATEGORY_DEFAULTS[category].low - LIMIT}° to {CATEGORY_DEFAULTS[category].low + LIMIT}°C
            </Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color="#5C6BC0" style={{ marginTop: 1 }} />
          <Text style={styles.infoText}>
            Setting a proper threshold ensures you receive critical alerts before product spoilage occurs.
            Notifications will be sent to the assigned supervisor.
          </Text>
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} activeOpacity={0.85} disabled={saving}>
          {saving
            ? <><ActivityIndicator color="#fff" /><Text style={styles.saveBtnText}>Verifying key...</Text></>
            : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={styles.saveBtnText}>Verify & Save Device</Text></>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6FB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F4F6FB',
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  body: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  bannerIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#EEF0FB', alignItems: 'center', justifyContent: 'center',
  },
  bannerIconText: { fontSize: 16, color: '#5C6BC0', fontWeight: '700' },  bannerText: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  label: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: -4 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 14, height: 50, fontSize: 15, color: '#1C1C1E',
  },
  inputReadonly: { backgroundColor: '#F4F6FB', color: '#9CA3AF' },
  sensorNameHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EEF0FB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    marginTop: -4,
  },
  sensorNameHintText: { fontSize: 12, color: '#5C6BC0' },
  sensorNameHintBold: { fontWeight: '700' },
  secretRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 50, height: 50, borderRadius: 10, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  select: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 14, height: 50, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  selectText: { fontSize: 15, color: '#1C1C1E' },
  chevron: { fontSize: 12, color: '#9CA3AF' },
  dropdown: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#E5E7EB', overflow: 'hidden', marginTop: -8,
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemActive: { backgroundColor: '#EEF0FB' },
  dropdownText: { fontSize: 15, color: '#1C1C1E' },
  dropdownTextActive: { color: '#5C6BC0', fontWeight: '600' },
  thresholdRow: { flexDirection: 'row', gap: 12 },
  thresholdCol: { flex: 1, gap: 6 },
  thresholdInput: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 0,
    height: 50,
  },
  thresholdInputError: { borderColor: '#EF4444' },
  thresholdValue: { flex: 1, fontSize: 15, color: '#1C1C1E', height: 50, textAlignVertical: 'center' },
  unit: { fontSize: 14, color: '#9CA3AF' },
  thresholdHint: { fontSize: 10, color: '#9CA3AF', marginTop: 3 },
  infoBox: {
    flexDirection: 'row', gap: 10, backgroundColor: '#EEF0FB',
    borderRadius: 12, padding: 14, alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, color: '#4B5563', lineHeight: 20 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#5C6BC0', borderRadius: 14, paddingVertical: 16, marginTop: 8,
    shadowColor: '#5C6BC0', shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  saveBtnDisabled: { opacity: 0.7 },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: '#9CA3AF', fontSize: 15 },
});
