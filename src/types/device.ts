export type DeviceCategory = 'freezer' | 'fridge' | 'cold_room' | 'general';

export interface Device {
  device_id: string;
  name: string;
  category: DeviceCategory;
  mac_address: string;
  temp_low_threshold: number;
  temp_high_threshold: number;
  battery_level?: number | null;
  last_sync?: number | null;
  created_at: number;
}
