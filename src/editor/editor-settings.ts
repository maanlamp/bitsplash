import { TILE_SIZE } from "../engine/tilemap/tile";
import { DEFAULT_SNAP_THRESHOLD } from "./snapping";
import { Subscribable } from "./subscribable";

/**
 * Global, cross-scene editor preferences persisted to `localStorage` (plan E6).
 * Unlike selection — which is per-scene — these are workspace-wide tunables
 * entered as raw numbers with explicit units:
 *
 * - `nudgeStep` — the world-unit distance of a `Shift`+arrow "big nudge"
 *   (plain arrow is always 1 unit, `Shift+Ctrl`+arrow is always one grid cell).
 * - `snapThreshold` — the world-unit distance within which a smart-guide snaps.
 * - `zoom` — the current editor zoom as a whole-number percentage. This is a
 *   read-only **mirror**: the main process owns zoom (Ctrl+`=`/`−`/`0`, applied
 *   via Chromium's per-host zoom map) and pushes changes over IPC; the mirror
 *   exists so the renderer can display the value.
 *
 * Values are validated only against the invalid domain (finite and `> 0`);
 * there is no arbitrary min/max clamp.
 */
export class EditorSettings extends Subscribable {
	private _nudgeStep: number;
	private _snapThreshold: number;
	private _zoom: number;

	constructor() {
		super();
		this._nudgeStep = read(NUDGE_KEY, TILE_SIZE / 4);
		this._snapThreshold = read(THRESHOLD_KEY, DEFAULT_SNAP_THRESHOLD);
		this._zoom = read(ZOOM_KEY, 100);
	}

	get nudgeStep(): number {
		return this._nudgeStep;
	}

	setNudgeStep(value: number): void {
		this._nudgeStep = this.setNumber(
			NUDGE_KEY,
			this._nudgeStep,
			value,
		);
	}

	get snapThreshold(): number {
		return this._snapThreshold;
	}

	setSnapThreshold(value: number): void {
		this._snapThreshold = this.setNumber(
			THRESHOLD_KEY,
			this._snapThreshold,
			value,
		);
	}

	get zoom(): number {
		return this._zoom;
	}

	/**
	 * Mirror the main process's zoom (a whole-number percentage) for display.
	 * Main is the source of truth; this only records the last broadcast value.
	 */
	setZoom(percent: number): void {
		this._zoom = this.setNumber(ZOOM_KEY, this._zoom, percent);
	}

	/**
	 * Persist `value` under `key` and notify, returning the value that should back
	 * the field. Rejects the invalid domain (non-finite, `<= 0`) and no-op writes
	 * (`value === current`) by returning `current` unchanged; no arbitrary clamp.
	 */
	private setNumber(
		key: string,
		current: number,
		value: number,
	): number {
		if (!Number.isFinite(value) || value <= 0 || value === current) {
			return current;
		}
		write(key, value);
		this.notify();
		return value;
	}
}

const NUDGE_KEY = "editor.nudgeStep";
const THRESHOLD_KEY = "editor.snapThreshold";
const ZOOM_KEY = "editor.zoom";

const read = (key: string, fallback: number): number => {
	try {
		const raw = localStorage.getItem(key);
		if (raw !== null) {
			const value = Number.parseFloat(raw);
			if (Number.isFinite(value) && value > 0) {
				return value;
			}
		}
	} catch {}
	return fallback;
};

const write = (key: string, value: number): void => {
	try {
		localStorage.setItem(key, String(value));
	} catch {}
};

/** The shared editor-settings instance read by the snap resolver and nudge hotkeys. */
export const editorSettings = new EditorSettings();
