import { createContext, type ReactNode, useContext } from "react";

/**
 * Identity of the editor window a subtree is rendered into. Each OS window runs
 * its own React root against its own `document`; this value lets descendants
 * resolve the owning window's `document`/`window` rather than assuming the main
 * realm's globals (which would portal menus, tooltips and dialogs into the
 * wrong window and break cross-document event delegation).
 */
export type WindowContextValue = Readonly<{
	/** Stable id of the owning window (the hub uses `HUB_WINDOW_ID`, `"hub"`). */
	windowId: string;
	/** The owning window's document — the root of its DOM. */
	doc: Document;
	/** The owning window's `Window` object. */
	win: Window;
}>;

/**
 * Context carrying the owning window's realm. `null` when no
 * {@link WindowProvider} is present, in which case consumers fall back to the
 * main realm (`document`/`window`) — correct for the hub and for tests.
 */
export const WindowContext = createContext<WindowContextValue | null>(
	null,
);

/**
 * Wraps a per-window React root so descendants resolve DOM against the owning
 * window. Mount one at the root of every window's workspace.
 *
 * @example
 * root.render(
 *   <WindowProvider windowId={id} doc={childDoc} win={childWin}>
 *     <Workspace />
 *   </WindowProvider>,
 * );
 */
export const WindowProvider = ({
	windowId,
	doc,
	win,
	children,
}: Readonly<{
	windowId: string;
	doc: Document;
	win: Window;
	children: ReactNode;
}>) => (
	<WindowContext.Provider value={{ windowId, doc, win }}>
		{children}
	</WindowContext.Provider>
);

/** The owning window's context, or `null` outside any {@link WindowProvider}. */
export const useWindowContext = (): WindowContextValue | null =>
	useContext(WindowContext);

/**
 * The owning window's `document`, falling back to the main realm's `document`
 * when rendered outside a {@link WindowProvider}.
 */
export const useWindowDocument = (): Document =>
	useContext(WindowContext)?.doc ?? document;

/**
 * The owning window's `Window`, falling back to the main realm's `window` when
 * rendered outside a {@link WindowProvider}.
 */
export const useWindowWindow = (): Window =>
	useContext(WindowContext)?.win ?? window;
