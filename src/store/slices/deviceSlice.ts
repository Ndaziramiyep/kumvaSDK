import { Device } from '../../types/device';

export interface DeviceSlice {
  devices: Device[];
  setDevices: (devices: Device[]) => void;
  addDevice: (device: Device) => void;
  removeDevice: (device_id: string) => void;
  updateDevice: (device: Device) => void;
}

export const createDeviceSlice = (set: any): DeviceSlice => ({
  devices: [],
  setDevices: (devices) => set({ devices }),
  addDevice: (device) => set((s: any) => ({ devices: [...s.devices, device] })),
  removeDevice: (device_id) => set((s: any) => ({ devices: s.devices.filter((d: Device) => d.device_id !== device_id) })),
  updateDevice: (device) => set((s: any) => ({ devices: s.devices.map((d: Device) => d.device_id === device.device_id ? device : d) })),
});
