type LiveSensorState = {
  mac: string;
  temperature?: number;
  humidity?: number;
  battery?: number;
  updatedAt: number;
};

const liveStates = new Map<string, LiveSensorState>();
const listeners = new Set<() => void>();

export const normalizeMacAddress = (mac: string | undefined): string =>
  (mac ?? '').replace(/[^0-9A-F]/gi, '').toUpperCase();

export const getLiveSensorState = (mac: string | undefined): LiveSensorState | undefined => {
  const key = normalizeMacAddress(mac);
  return key ? liveStates.get(key) : undefined;
};

export const getAllLiveSensorStates = (): Map<string, LiveSensorState> =>
  new Map(liveStates);

export const setLiveSensorState = (
  mac: string,
  partial: Partial<Omit<LiveSensorState, 'mac' | 'updatedAt'>>
): void => {
  const key = normalizeMacAddress(mac);
  if (!key) return;

  const existing = liveStates.get(key);
  const merged: LiveSensorState = {
    mac: key,
    temperature: typeof partial.temperature === 'number' ? partial.temperature : existing?.temperature,
    humidity:    typeof partial.humidity    === 'number' ? partial.humidity    : existing?.humidity,
    battery:     typeof partial.battery     === 'number' ? partial.battery     : existing?.battery,
    updatedAt: Date.now(),
  };

  // Only update updatedAt if we actually have sensor data
  if (merged.temperature === undefined && merged.humidity === undefined) {
    if (existing) return; // don't overwrite a good state with an empty one
    merged.updatedAt = 0;
  }

  liveStates.set(key, merged);
  listeners.forEach(cb => cb());
};

export const subscribeLiveSensorStates = (
  callback: (states: Map<string, LiveSensorState>) => void
): { remove: () => void } => {
  const wrapper = () => callback(getAllLiveSensorStates());
  listeners.add(wrapper);
  wrapper();
  return {
    remove: () => listeners.delete(wrapper),
  };
};
