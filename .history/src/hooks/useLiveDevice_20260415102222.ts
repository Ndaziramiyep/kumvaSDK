import { useEffect, useState } from 'react';
import {
  getAllLiveSensorStates,
  getLiveSensorState,
  subscribeLiveSensorStates,
} from '../services/liveDeviceService';

export function useLiveDeviceState(mac?: string) {
  const [state, setState] = useState(() => getLiveSensorState(mac));

  useEffect(() => {
    if (!mac) return undefined;
    const subscription = subscribeLiveSensorStates(() => setState(getLiveSensorState(mac)));
    return () => subscription.remove();
  }, [mac]);

  return state;
}

export function useLiveDeviceStates() {
  const [states, setStates] = useState(() => getAllLiveSensorStates());

  useEffect(() => {
    const subscription = subscribeLiveSensorStates(setStates);
    return () => subscription.remove();
  }, []);

  return states;
}
