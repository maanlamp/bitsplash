import type { ReadonlyECS } from "../../engine/ecs";
import { setWeatherPreview } from "../../engine/weather/preview";
import { Subscribable } from "../subscribable";
import {
	defaultWeatherPreviewState,
	previewStateOfPresetId,
	type WeatherPreviewState,
	weatherPreviewRequest,
} from "./weather-preview-state";

/**
 * One scene view's weather preview: the popover's view state, and the only writer
 * of that world's entry in the engine's preview store.
 *
 * **Nothing here touches a component.** Scrubbing calls
 * {@link setWeatherPreview}, a `WeakMap` keyed by the ECS that the edit journal,
 * both save tripwires and every snapshot are structurally blind to. Writing a
 * component field instead would either journal a scrub as an authored edit or
 * make `SceneDocument.save` hard-crash on the replay diff.
 *
 * The preview is installed lazily: opening the popover shows what the scene's
 * climate does on its own and installs nothing. The first scrub installs the whole
 * state; {@link WeatherPreviewStore.reset} takes it back out again.
 */
export class WeatherPreviewStore extends Subscribable {
	private scrub: WeatherPreviewState | null = null;
	private seeded = false;
	private silenced = false;

	constructor(private readonly ecs: ReadonlyECS) {
		super();
	}

	/**
	 * The scrub the popover renders, seeded on first read from the resolved
	 * climate's default preset. `null` means weather is disabled — no catalog is
	 * registered, so there is nothing to preview.
	 */
	get state(): WeatherPreviewState | null {
		if (!this.seeded) {
			this.seeded = true;
			this.scrub = defaultWeatherPreviewState(this.ecs);
		}
		return this.scrub;
	}

	/**
	 * Whether this view's weather ambience is muted. Only the focused view ticks
	 * its world, so this mutes what is currently audible.
	 */
	get muted(): boolean {
		return this.silenced;
	}

	/**
	 * Preview a catalog preset — including one the scene's climate would never
	 * roll, which is the point of the picker. The scrubbed scalars are reset to
	 * that preset's own targets so the sliders describe what is being heard.
	 */
	setPreset(presetId: string): void {
		this.install(previewStateOfPresetId(presetId));
	}

	setWind(wind: number): void {
		const current = this.state;
		if (current) {
			this.install({ ...current, wind });
		}
	}

	setPrecipitation(precipitation: number): void {
		const current = this.state;
		if (current) {
			this.install({ ...current, precipitation });
		}
	}

	setMuted(muted: boolean): void {
		if (this.silenced === muted) {
			return;
		}
		this.silenced = muted;
		this.notify();
	}

	/**
	 * Drop the preview: the world goes back to resolving its own weather, and the
	 * sliders re-seed from the scene's climate — which is also how a climate
	 * changed in the inspector reaches the popover.
	 */
	reset(): void {
		setWeatherPreview(this.ecs, null);
		this.scrub = defaultWeatherPreviewState(this.ecs);
		this.seeded = true;
		this.notify();
	}

	/** Leave no preview behind on a world whose view is closing. */
	dispose(): void {
		setWeatherPreview(this.ecs, null);
	}

	private install(next: WeatherPreviewState): void {
		this.scrub = next;
		this.seeded = true;
		setWeatherPreview(this.ecs, weatherPreviewRequest(next));
		this.notify();
	}
}
