import type { OklchColor } from "./oklch";

// The surface the shared color picker renders against. `SpriteEditorState`
// implements this directly; inspector fields provide a history-backed adapter.
export interface ColorPickerModel {
	subscribe(listener: () => void): () => void;
	readonly l: number;
	readonly c: number;
	readonly h: number;
	readonly alpha: number;
	readonly color: OklchColor;
	readonly css: string; // includes alpha
	readonly opaqueCss: string; // alpha forced to 1
	setLc(l: number, c: number): void;
	setH(h: number): void;
	setAlpha(alpha: number): void;
	setColor(color: OklchColor): void;
	// Called at the end of a gesture (slider release, input blur, eyedrop).
	// Models that persist to history use this to record a single edit.
	commit?(): void;
}
