import type { Scene } from "../engine/scene/scene";
import type { SerializedWorld } from "../engine/serialization/registry";
import { serializeWorld } from "../engine/serialization/serialize";
import { exportSceneJson } from "./level-export";
import { Subscribable } from "./subscribable";

type Baseline = Readonly<{
	entities: SerializedWorld;
	tiles: ReadonlyArray<readonly [number, number]>;
}>;

export class SceneDocument extends Subscribable {
	private _dirty = false;
	private baseline: Baseline;

	constructor(readonly scene: Scene) {
		super();
		this.baseline = this.capture();
	}

	get dirty(): boolean {
		return this._dirty;
	}

	markDirty(): void {
		this._dirty = true;
		this.notify();
	}

	markSaved(): void {
		this.baseline = this.capture();
		this._dirty = false;
		this.notify();
	}

	revert(): void {
		this.scene.restore(this.baseline.entities);
		const grid = this.scene.tileGrid;
		if (grid) {
			grid.clear();
			for (const [gx, gy] of this.baseline.tiles) {
				grid.setTile(gx, gy);
			}
		}
		this._dirty = false;
		this.notify();
	}

	toBlob(): Blob {
		return new Blob(
			[exportSceneJson(this.scene, serializeWorld(this.scene.ecs))],
			{ type: "application/json" },
		);
	}

	private capture(): Baseline {
		return {
			entities: serializeWorld(this.scene.ecs),
			tiles: this.scene.tileGrid?.occupiedCells() ?? [],
		};
	}
}
