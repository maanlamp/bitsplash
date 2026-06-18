import type { EntityId } from "../engine/ecs";
import { Subscribable } from "./subscribable";

export type EditorMode =
	| "select"
	| "paint"
	| "fill"
	| "lasso"
	| "eraser"
	| "pan";

export class EditorState extends Subscribable {
	private _mode: EditorMode = "select";
	private _selected: EntityId | null = null;
	private _hovered: EntityId | null = null;
	private _inspectingWorld = false;

	get mode(): EditorMode {
		return this._mode;
	}

	get selected(): EntityId | null {
		return this._selected;
	}

	get hovered(): EntityId | null {
		return this._hovered;
	}

	get inspectingWorld(): boolean {
		return this._inspectingWorld;
	}

	setMode(mode: EditorMode): void {
		if (mode !== this._mode) {
			this._mode = mode;
			this.notify();
		}
	}

	setSelected(entity: EntityId | null): void {
		if (entity !== this._selected || this._inspectingWorld) {
			this._selected = entity;
			this._inspectingWorld = false;
			this.notify();
		}
	}

	inspectWorld(): void {
		if (!this._inspectingWorld || this._selected !== null) {
			this._inspectingWorld = true;
			this._selected = null;
			this.notify();
		}
	}

	setHovered(entity: EntityId | null): void {
		if (entity !== this._hovered) {
			this._hovered = entity;
			this.notify();
		}
	}
}
