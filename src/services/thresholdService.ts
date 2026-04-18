import { Device } from '../types/device';
import { Reading } from '../types/reading';
import { Incident } from '../types/incident';
import { insertIncident } from '../database/repositories/incidentRepository';

// Incident Engine: for each record, check threshold — create incident if outside, do nothing if normal
export async function processReading(device: Device, reading: Reading): Promise<void> {
  const { temperature } = reading;
  const { temp_low_threshold, temp_high_threshold } = device;

  if (temperature > temp_high_threshold || temperature < temp_low_threshold) {
    const incident: Incident = {
      device_id: device.device_id,
      device_name: device.name,
      device_category: device.category,
      start_time: reading.timestamp,
      end_time: null,
      max_temperature: temperature,
      min_temperature: temperature,
    };
    await insertIncident(incident);
  }
}
