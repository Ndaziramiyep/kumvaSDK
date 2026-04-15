import { useEffect } from 'react';
import { startSync, stopSync } from '../services/syncService';

export function useSync() {
  useEffect(() => {
    startSync();
    return () => stopSync();
  }, []);
}
