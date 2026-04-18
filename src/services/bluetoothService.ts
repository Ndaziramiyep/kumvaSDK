import { NativeModules, NativeEventEmitter } from 'react-native';

const { MinewBleModule } = NativeModules;
const bleEvents = MinewBleModule ? new NativeEventEmitter(MinewBleModule) : null;

// ── Scan ──────────────────────────────────────────────────────────────────────
export const startScan  = () => MinewBleModule?.startScan();
export const stopScan   = () => MinewBleModule?.stopScan();

// ── Secret Key ────────────────────────────────────────────────────────────────
export const setSecretKey = (key: string) => MinewBleModule?.setSecretKey(key);

// ── Connect ───────────────────────────────────────────────────────────────────
export const connect    = (mac: string) => MinewBleModule?.connectToDevice(mac, null);
export const disConnect = (mac: string) => MinewBleModule?.disconnectDevice(mac);

// ── Read/Write ────────────────────────────────────────────────────────────────
export const readThHistoryData = (mac: string, fromTimestamp?: number | null) =>
  MinewBleModule?.readHistoryData(mac, fromTimestamp ?? 0);

export const setTemperatureUnit = (mac: string, isCelsius: boolean): Promise<boolean> =>
  MinewBleModule?.setTemperatureUnit(mac, isCelsius) ?? Promise.resolve(false);

export const setThAlarmValue = (
  mac: string, minTemp: number, maxTemp: number, minHumi: number, maxHumi: number
): Promise<boolean> =>
  MinewBleModule?.setThAlarmValue(mac, minTemp, maxTemp, minHumi, maxHumi) ?? Promise.resolve(false);

export const setThAlarmOff = (mac: string): Promise<boolean> =>
  MinewBleModule?.setThAlarmOff(mac) ?? Promise.resolve(false);

export const setOpenHistoryDataStore = (mac: string, isOpen: boolean): Promise<boolean> =>
  MinewBleModule?.setOpenHistoryDataStore(mac, isOpen) ?? Promise.resolve(false);

export const resetDevice = (mac: string): Promise<boolean> =>
  MinewBleModule?.resetDevice(mac) ?? Promise.resolve(false);

// ── Event listeners ───────────────────────────────────────────────────────────
export const onScanResult = (cb: (devices: any[]) => void) =>
  bleEvents?.addListener('onDevicesUpdated', cb);

export const onConnState = (cb: (event: any) => void) =>
  bleEvents?.addListener('onConnectionChange', cb);

export const onThHistoryData = (cb: (data: any) => void) =>
  bleEvents?.addListener('onHistoryDataReceived', cb);

export const onScanError = (cb: (event: any) => void) =>
  bleEvents?.addListener('onScanError', cb);
