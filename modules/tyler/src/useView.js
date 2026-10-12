import { useSyncExternalStore } from 'react';
import { tyler } from './runtime';

// Subscribe a component to one slice of TYLER's view state ({ state, face, text }).
export function useView(selector) {
  const { subscribe, getState } = tyler.view;
  return useSyncExternalStore(subscribe, () => selector(getState()));
}
