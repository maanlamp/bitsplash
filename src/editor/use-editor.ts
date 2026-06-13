import { useSyncExternalStore } from "react";

type Subscribable = Readonly<{
	subscribe: (listener: () => void) => () => void;
}>;

export const useEditorValue = <S extends Subscribable, T>(
	store: S,
	selector: (store: S) => T,
): T => useSyncExternalStore(store.subscribe, () => selector(store));
