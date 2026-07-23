import { useWindowContext } from "./window-context";

/**
 * The `<body>` of the owning window's document, for use as a base-ui `Portal`
 * `container`. Resolves from {@link WindowContext} when present and otherwise
 * falls back to the main realm's `document.body` — so menus, tooltips,
 * popovers and dialogs portal into the window that triggered them instead of
 * the hub's document.
 *
 * @example
 * const container = usePortalContainer();
 * return (
 *   <Popover.Portal container={container}>
 *     …
 *   </Popover.Portal>
 * );
 */
export const usePortalContainer = (): HTMLElement =>
	(useWindowContext()?.doc ?? document).body;
