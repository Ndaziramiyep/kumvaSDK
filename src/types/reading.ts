export interface Reading {
  reading_id?: number;
  device_id: string;
  temperature: number;
  humidity?: number | null;
  timestamp: number;
}
