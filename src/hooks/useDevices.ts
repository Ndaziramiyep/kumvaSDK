import { useEffect } from 'react';
import { useAppStore } from '../store/store';
import { getAllDevices } from '../database/repositories/deviceRepository';

export function useDevices() {
  const devices = useAppStore(s => s.devices);
  const setDevices = useAppStore(s => s.setDevices);

  useEffect(() => {
    getAllDevices()
      .then(dbDevices => {
        const current = useAppStore.getState().devices;
        const merged = [...dbDevices];
        current.forEach(d => {
          if (!merged.find(x => x.device_id === d.device_id)) merged.push(d);
        });
        setDevices(merged);
      })
      .catch(console.error);
  }, []);

  return { devices };
}
