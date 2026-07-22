import { Subscribable } from "../subscribable";
import { DEFAULT_ONION, type OnionSettings } from "./onion-skin";

/**
 * The sprite editor's onion-skinning view state: a {@link Subscribable} wrapper
 * around an {@link OnionSettings} value so the timeline control and the
 * texture-panel ghost render system stay in sync. Onion is a **view overlay**
 * only — it never touches the document, the composite canvas, or saved bakes.
 */
export class OnionState extends Subscribable {
	private _settings: OnionSettings = DEFAULT_ONION;

	get settings(): OnionSettings {
		return this._settings;
	}

	setEnabled(enabled: boolean): void {
		this.patch({ enabled });
	}

	toggle(): void {
		this.patch({ enabled: !this._settings.enabled });
	}

	setPrevCount(prevCount: number): void {
		this.patch({ prevCount: clampCount(prevCount) });
	}

	setNextCount(nextCount: number): void {
		this.patch({ nextCount: clampCount(nextCount) });
	}

	private patch(next: Partial<OnionSettings>): void {
		const merged = { ...this._settings, ...next };
		if (
			merged.enabled === this._settings.enabled &&
			merged.prevCount === this._settings.prevCount &&
			merged.nextCount === this._settings.nextCount
		) {
			return;
		}
		this._settings = merged;
		this.notify();
	}
}

const clampCount = (n: number): number =>
	Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
