import {
	createContext,
	useContext,
	useSyncExternalStore,
} from "react";
import type { EntityId } from "../engine/ecs";
import type { EditorState } from "./editor-state";

const EditorStoreContext = createContext<EditorState | null>(null);

export const EditorStoreProvider = EditorStoreContext.Provider;

export const useEditorStore = (): EditorState => {
	const store = useContext(EditorStoreContext);
	if (!store) {
		throw new Error(
			"useEditorStore must be used within an EditorStoreProvider",
		);
	}
	return store;
};

export const useIsHovered = (
	entity: EntityId | undefined,
): boolean => {
	const store = useEditorStore();
	return useSyncExternalStore(
		store.subscribe,
		() => entity != null && store.hovered === entity,
	);
};
