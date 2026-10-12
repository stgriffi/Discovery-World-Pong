import { useSyncExternalStore } from 'react';
import { controller } from './runtime';

// Subscribe a component to one slice of the controller's UI state. The selector must
// return a primitive (or a stable reference) so unrelated changes don't re-render.
export function useUi(selector) {
  const { subscribe, getState } = controller.ui;
  return useSyncExternalStore(subscribe, () => selector(getState()));
}
