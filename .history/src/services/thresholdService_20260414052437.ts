import { Device } from '../types/device';
import { Reading } from '../types/reading';
import { Incident } from '../types/incident';
import { insertIncident } from '../database/repositories/incidentRepository';
import { scheduleAlert } from './notificationService';

export async function checkThreshold(device: Device, reading: Reading): Promise<void> {
  const { temperature } = reading;
  const { temp_low_threshold, temp_high_threshold } = device;

  if (temperature > temp_high_threshold || temperature < temp_low_threshold) {
    const incident: Incident = {
      device_id: device.device_id,
      start_time: reading.timestamp,
      end_time: null,
      max_temperature: temperature,
    };
    await insertIncident(incident);
    // Schedule notification
    await scheduleAlert('Temperature Alert', `Device ${device.name} has temperature ${temperature}°C, outside threshold.`);
  }
}
