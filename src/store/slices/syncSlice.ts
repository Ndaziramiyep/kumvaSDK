export interface SyncSlice {
  lastSyncedAt: number | null;
  setLastSyncedAt: (ts: number) => void;
}

export const createSyncSlice = (set: any): SyncSlice => ({
  lastSyncedAt: null,
  setLastSyncedAt: (ts) => set({ lastSyncedAt: ts }),
});
