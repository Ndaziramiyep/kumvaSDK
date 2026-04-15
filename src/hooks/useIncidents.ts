import { useEffect } from 'react';
import { useAppStore } from '../store/store';
import { getAllIncidents } from '../database/repositories/incidentRepository';

export function useIncidents() {
  const incidents = useAppStore(s => s.incidents);
  const setIncidents = useAppStore(s => s.setIncidents);

  useEffect(() => {
    getAllIncidents().then(setIncidents);
  }, []);

  return { incidents };
}
