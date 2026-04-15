import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/store';
import { getAllDevices } from '../database/repositories/deviceRepository';

// Hydrate store from DB once per app session (not per component mount)
let hydrated = false;

export function useDevices() {
  // Reactive: re-renders whenever addDevice / setDevices changes the store
  const devices = useAppStore(s => s.devices);
  const setDevices = useAppStore(s => s.setDevices);

  useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    getAllDevices()
      .then(dbDevices => {
        if (dbDevices.length > 0) {
          // Merge DB devices with any already in store (added this session before hydration)
          const current = useAppStore.getState().devices;
          const merged = [...dbDevices];
          current.forEach(d => {
            if (!merged.find(x => x.device_id === d.device_id)) merged.push(d);
          });
          setDevices(merged);
        }
      })
      .catch(console.error);
  }, []);

  return { devices };
}
