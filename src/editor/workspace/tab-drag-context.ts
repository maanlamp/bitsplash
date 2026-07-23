import { createContext, useContext } from "react";
import type { TabDragController } from "./tab-drag-controller";

/**
 * The app-global {@link TabDragController}, shared by every window's React root
 * so a tab drag started in one window can hand off across the shared heap. Null
 * outside the provider (tests, storybook), where tabs simply do not drag.
 */
export const TabDragContext = createContext<TabDragController | null>(
	null,
);

/** The tab-drag controller for the current tree, or `null` if none is provided. */
export const useTabDragController = (): TabDragController | null =>
	useContext(TabDragContext);
