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
    // Subscribe and force a new Map reference on every update so React re-renders
    const subscription = subscribeLiveSensorStates(newStates => {
      setStates(new Map(newStates));
    });
    return () => subscription.remove();
  }, []);

  return states;
}
