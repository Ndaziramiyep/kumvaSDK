export interface Incident {
  incident_id?: number;
  device_id: string;
  device_name?: string;
  device_category?: string;
  start_time: number;
  end_time?: number | null;
  max_temperature: number;
  min_temperature?: number | null;
}
