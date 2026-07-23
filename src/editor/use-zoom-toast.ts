import { useEffect } from "react";
import { editorSettings } from "./editor-settings";
import { toastManager } from "./toast";

type WindowManifestBridge = {
	onZoomChanged: (listener: (percent: number) => void) => () => void;
};

const ZOOM_TOAST_ID = "editor-zoom";
const ZOOM_TOAST_TIMEOUT = 1500;

/**
 * Listen for main's `zoom-changed` events (fired on Ctrl+`=`/`−`/`0`) and show
 * a transient toast with the new percentage, reusing a single toast id so rapid
 * changes update in place rather than stacking. Also mirrors the value into
 * {@link editorSettings} for display. No-op outside the Electron shell.
 */
export const useZoomToast = (): void => {
	useEffect(() => {
		const bridge = (
			globalThis as { windowManifest?: WindowManifestBridge }
		).windowManifest;
		if (!bridge) {
			return;
		}
		return bridge.onZoomChanged((percent) => {
			editorSettings.setZoom(percent);
			toastManager.add({
				id: ZOOM_TOAST_ID,
				title: `Zoom ${percent}%`,
				timeout: ZOOM_TOAST_TIMEOUT,
			});
		});
	}, []);
};

/** Mounts {@link useZoomToast} as a single self-contained element. */
export const ZoomToastListener = (): null => {
	useZoomToast();
	return null;
};
