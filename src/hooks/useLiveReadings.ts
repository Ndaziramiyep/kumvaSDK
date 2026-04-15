import { useState, useEffect } from 'react';
import { Reading } from '../types/reading';
import { getReadingsByDevice } from '../database/repositories/readingRepository';

export function useLiveReadings(deviceId: string) {
  const [readings, setReadings] = useState<Reading[]>([]);

  useEffect(() => {
    const load = () =>
      getReadingsByDevice(deviceId, 20).then(setReadings).catch(console.error);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [deviceId]);

  return { readings };
}
