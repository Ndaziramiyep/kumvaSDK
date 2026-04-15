import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Animated, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PermissionStatus } from '../../utils/permissions';

interface Props {
  status: Exclude<PermissionStatus, 'granted'>;
  onPrimaryAction: () => void;
}

function getConfig(status: Exclude<PermissionStatus, 'granted'>, isIOS: boolean) {
  switch (status) {
    case 'needs_permission': return {
      icon: 'bluetooth' as const,
      iconColor: '#4F6FE8',
      title: 'Permissions Required',
      body: isIOS
        ? 'Location permission is required to scan for nearby Bluetooth devices.'
        : 'Bluetooth and Location permissions are required to scan and connect to devices.',
      btnLabel: 'Grant Permissions',
      btnIcon: 'shield-checkmark-outline' as const,
    };
    case 'denied': return {
      icon: 'lock-closed-outline' as const,
      iconColor: '#EF4444',
      title: 'Permission Denied',
      body: 'Required permissions were denied. Please open Settings and allow the necessary access.',
      btnLabel: 'Open Settings',
      btnIcon: 'settings-outline' as const,
    };
    case 'location_off': return {
      icon: 'location-outline' as const,
      iconColor: '#F59E0B',
      title: 'Location is Off',
      body: isIOS
        ? 'Please enable Location Services in Settings to allow Bluetooth scanning.'
        : 'Location services must be enabled for Bluetooth scanning to work.',
      btnLabel: 'Enable Location',
      btnIcon: 'location-outline' as const,
    };
  }
}

export default function BluetoothPermissionModal({ status, onPrimaryAction }: Props) {
  const cardY       = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const isIOS       = Platform.OS === 'ios';
  const cfg         = getConfig(status, isIOS);

  useEffect(() => {
    cardY.setValue(60);
    cardOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(cardY, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [status]);

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ translateY: cardY }], opacity: cardOpacity }]}>

          <View style={styles.iconWrap}>
            <Ionicons name={cfg.icon} size={30} color={cfg.iconColor} />
          </View>

          <Text style={styles.title}>{cfg.title}</Text>
          <Text style={styles.body}>{cfg.body}</Text>

          <Pressable onPress={onPrimaryAction} style={styles.btnWrap}>
            <LinearGradient
              colors={['#6B7FE3', '#9B6FE8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btn}
            >
              <Ionicons name={cfg.btnIcon} size={18} color="#fff" />
              <Text style={styles.btnText}>{cfg.btnLabel}</Text>
            </LinearGradient>
          </Pressable>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#F0F2FB',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#1C1C1E', textAlign: 'center' },
  body:  { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 6 },
  btnWrap: { width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  btn: { paddingVertical: 16, alignItems: 'center', borderRadius: 16, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
