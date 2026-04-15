import { Platform, PermissionsAndroid, Linking } from 'react-native';
import * as Location from 'expo-location';

export type PermissionStatus =
  | 'granted'
  | 'needs_permission'
  | 'denied'
  | 'location_off';

const IS_ANDROID = Platform.OS === 'android';
const IS_IOS     = Platform.OS === 'ios';
const API_LEVEL  = IS_ANDROID ? (Platform.Version as number) : 0;

function getAndroidPermissions(): string[] {
  if (API_LEVEL >= 31) {
    // Android 12+ — new BLE permissions
    return [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];
  }
  if (API_LEVEL >= 29) {
    // Android 10–11 — fine location only
    return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  }
  // Android 8–9 — coarse location is enough for BLE
  return [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
}

// ── Check ─────────────────────────────────────────────────────────────────────
export async function checkAllStatus(): Promise<PermissionStatus> {
  if (IS_IOS) {
    // On iOS check location permission via expo-location
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'denied') return 'denied';
    if (status !== 'granted') return 'needs_permission';

    const locationEnabled = await Location.hasServicesEnabledAsync();
    if (!locationEnabled) return 'location_off';

    return 'granted';
  }

  if (IS_ANDROID) {
    const perms = getAndroidPermissions();
    const checks = await Promise.all(
      perms.map(p => PermissionsAndroid.check(p as any))
    );
    if (checks.some(c => !c)) return 'needs_permission';

    const locationEnabled = await Location.hasServicesEnabledAsync();
    if (!locationEnabled) return 'location_off';

    return 'granted';
  }

  return 'granted';
}

// ── Request ───────────────────────────────────────────────────────────────────
export async function requestPermissions(): Promise<'granted' | 'denied'> {
  if (IS_IOS) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  }

  if (IS_ANDROID) {
    const perms = getAndroidPermissions();

    if (perms.length === 1) {
      const result = await PermissionsAndroid.request(perms[0] as any, {
        title: 'Location Permission',
        message: 'This app needs location access to scan for nearby Bluetooth devices.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
      return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
    }

    const results = await PermissionsAndroid.requestMultiple(perms as any);
    const allGranted = Object.values(results).every(
      v => v === PermissionsAndroid.RESULTS.GRANTED
    );
    return allGranted ? 'granted' : 'denied';
  }

  return 'granted';
}

// ── Open Settings ─────────────────────────────────────────────────────────────
export async function openAppSettings(): Promise<void> {
  await Linking.openSettings();
}

export async function openLocationSettings(): Promise<void> {
  if (IS_ANDROID) {
    try {
      const IntentLauncher = require('expo-intent-launcher');
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS
      );
    } catch {
      await Linking.openSettings();
    }
  } else {
    await Linking.openSettings();
  }
}
