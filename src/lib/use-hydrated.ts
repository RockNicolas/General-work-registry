import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** false no servidor e até o React hidratar no cliente; true depois. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
