import { Incident } from '../../types/incident';

export interface IncidentSlice {
  incidents: Incident[];
  setIncidents: (incidents: Incident[]) => void;
  addIncident: (incident: Incident) => void;
}

export const createIncidentSlice = (set: any): IncidentSlice => ({
  incidents: [],
  setIncidents: (incidents) => set({ incidents }),
  addIncident: (incident) => set((s: any) => ({ incidents: [incident, ...s.incidents] })),
});
