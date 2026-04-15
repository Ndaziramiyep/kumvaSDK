import { NativeModules, NativeEventEmitter } from 'react-native';

const { MinewBleModule } = NativeModules;
const bleEvents = MinewBleModule ? new NativeEventEmitter(MinewBleModule) : null;

export const startScan = () => MinewBleModule?.startScan();
export const stopScan = () => MinewBleModule?.stopScan();
export const connect = (macAddress: string) => MinewBleModule?.connectToDevice(macAddress, null);
export const disConnect = (macAddress: string) => MinewBleModule?.disconnectDevice(macAddress);
export const sendPassword = (macAddress: string, password: string) => MinewBleModule?.sendPassword(macAddress, password);
export const readThHistoryData = (macAddress: string) => MinewBleModule?.readHistoryData(macAddress);
export const readDoorHistoryData = (macAddress: string) => MinewBleModule?.readHistoryData(macAddress);

export const onScanResult = (callback: (devices: any[]) => void) =>
  bleEvents?.addListener('onDevicesUpdated', callback);

export const onConnState = (callback: (event: any) => void) =>
  bleEvents?.addListener('onConnectionChange', callback);

export const onThHistoryData = (callback: (data: any) => void) =>
  bleEvents?.addListener('onHistoryDataReceived', callback);

export const onDoorHistoryData = (callback: (data: any) => void) =>
  bleEvents?.addListener('onHistoryDataReceived', callback);
