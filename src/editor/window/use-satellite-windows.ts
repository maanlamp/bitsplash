import { type ReactNode, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { WindowId } from "../workspace/layout";
import { mirrorHead } from "./mirror-head";

/** A window manifest bridge as exposed by the Electron preload, if present. */
type WindowManifestBridge = Readonly<{
	associateWindow: (
		windowId: WindowId,
	) => Promise<unknown> | undefined;
}>;

type SatelliteHandle = {
	readonly win: Window;
	readonly container: HTMLElement;
	readonly root: Root;
	readonly stopMirror: () => void;
	poll: number;
	closed: boolean;
	disposed: boolean;
};

/** Callbacks and desired state the satellite manager reconciles against. */
export type SatelliteWindowsParams = Readonly<{
	/** The window ids that should currently exist as satellites. */
	satelliteIds: ReadonlyArray<WindowId>;
	/** Build the shell tree for a satellite, against its own document/window. */
	renderShell: (
		windowId: WindowId,
		doc: Document,
		win: Window,
	) => ReactNode;
	/** Fired once a satellite's realm is live (start its rAF loop, etc.). */
	onOpened: (windowId: WindowId, win: Window) => void;
	/** Fired when the OS window is closed by the user (remove its layout). */
	onClosed: (windowId: WindowId) => void;
}>;

const POLL_MS = 30;
const CLOSE_WATCH_MS = 500;

const teardown = (handle: SatelliteHandle): void => {
	handle.closed = true;
	window.clearInterval(handle.poll);
	handle.stopMirror();
	disposeRoot(handle);
};

// React forbids unmounting a root while it is inside its own render/commit work,
// and this manager tears roots down from a passive effect that React runs with
// its commit context active. Deferring the unmount to a microtask lets React's
// synchronous work fully unwind first, so the root is unmounted while React is
// idle. The `disposed` guard keeps the teardown idempotent, and closing the OS
// window happens only after the root is gone so React never unmounts into a
// destroyed document.
const disposeRoot = (handle: SatelliteHandle): void => {
	if (handle.disposed) {
		return;
	}
	handle.disposed = true;
	queueMicrotask(() => {
		handle.root.unmount();
		if (!handle.win.closed) {
			handle.win.close();
		}
	});
};

/**
 * Imperatively keep the set of open satellite windows in sync with
 * {@link SatelliteWindowsParams.satelliteIds}. Each satellite is a
 * `window.open("/popout.html")` child that shares this JS heap: a container
 * created in the main document is adopted into the child, the main `<head>`
 * styles are mirrored across, and a per-window React root renders the shell into
 * it. Reconciliation runs after every render so fresh props reach every child
 * root; windows added to the desired set are opened, windows removed are torn
 * down, and an OS-closed window reports back through `onClosed`.
 */
export const useSatelliteWindows = (
	params: SatelliteWindowsParams,
): void => {
	const paramsRef = useRef(params);
	paramsRef.current = params;
	const handlesRef = useRef(new Map<WindowId, SatelliteHandle>());
	const pendingRef = useRef(new Set<WindowId>());

	useEffect(() => {
		const current = paramsRef.current;
		const handles = handlesRef.current;
		const pending = pendingRef.current;
		const desired = new Set(current.satelliteIds);

		for (const [id, handle] of handles) {
			if (!desired.has(id)) {
				teardown(handle);
				handles.delete(id);
			}
		}

		for (const id of desired) {
			if (handles.has(id) || pending.has(id)) {
				continue;
			}
			openSatellite(id, paramsRef, handles, pending);
		}

		for (const [id, handle] of handles) {
			if (!handle.closed) {
				handle.root.render(
					current.renderShell(id, handle.win.document, handle.win),
				);
			}
		}
	});

	useEffect(() => {
		const handles = handlesRef.current;
		return () => {
			for (const handle of handles.values()) {
				teardown(handle);
			}
			handles.clear();
		};
	}, []);
};

const openSatellite = (
	windowId: WindowId,
	paramsRef: { current: SatelliteWindowsParams },
	handles: Map<WindowId, SatelliteHandle>,
	pending: Set<WindowId>,
): void => {
	const child = window.open(
		`${location.origin}/popout.html`,
		windowId,
		"popup",
	);
	if (!child) {
		paramsRef.current.onClosed(windowId);
		return;
	}
	pending.add(windowId);

	const boot = (): void => {
		if (child.closed) {
			pending.delete(windowId);
			paramsRef.current.onClosed(windowId);
			return;
		}
		const rootEl = child.document.getElementById("popout-root");
		if (!rootEl) {
			window.setTimeout(boot, POLL_MS);
			return;
		}
		if (!child.opener) {
			throw new Error(
				"popout has no opener — shared heap severed (COOP?)",
			);
		}

		// The global stylesheet sizes `html, body, #root` to full height, but a
		// popout hosts the shell under `#popout-root` + an adopted container that
		// those rules never match — so the full-height chain must be set here or
		// the workspace collapses to zero height (only the tab strip shows).
		child.document.documentElement.style.height = "100%";
		child.document.body.style.height = "100%";
		child.document.body.style.margin = "0";
		rootEl.style.height = "100%";
		const container = child.document.createElement("div");
		container.style.width = "100%";
		container.style.height = "100%";
		rootEl.appendChild(container);

		const stopMirror = mirrorHead(child.document);
		const root = createRoot(container);
		const handle: SatelliteHandle = {
			win: child,
			container,
			root,
			stopMirror,
			poll: 0,
			closed: false,
			disposed: false,
		};

		const onClose = (): void => {
			if (handle.closed) {
				return;
			}
			handle.closed = true;
			window.clearInterval(handle.poll);
			paramsRef.current.onClosed(windowId);
		};
		child.addEventListener("pagehide", onClose);
		handle.poll = window.setInterval(() => {
			if (child.closed) {
				onClose();
			}
		}, CLOSE_WATCH_MS);

		handles.set(windowId, handle);
		pending.delete(windowId);

		const bridge = (
			child as unknown as { windowManifest?: WindowManifestBridge }
		).windowManifest;
		void bridge?.associateWindow(windowId);

		paramsRef.current.onOpened(windowId, child);
		root.render(
			paramsRef.current.renderShell(windowId, child.document, child),
		);
	};

	boot();
};
