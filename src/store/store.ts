import { create } from 'zustand';
import { createDeviceSlice, DeviceSlice } from './slices/deviceSlice';
import { createIncidentSlice, IncidentSlice } from './slices/incidentSlice';
import { createSyncSlice, SyncSlice } from './slices/syncSlice';

type AppStore = DeviceSlice & IncidentSlice & SyncSlice;

export const useAppStore = create<AppStore>((set) => ({
  ...createDeviceSlice(set),
  ...createIncidentSlice(set),
  ...createSyncSlice(set),
}));
