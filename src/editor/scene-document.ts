import type { Scene } from "../engine/scene/scene";
import type { SerializedWorld } from "../engine/serialization/registry";
import { serializeWorld } from "../engine/serialization/serialize";
import { exportSceneJson } from "./level-export";
import { Subscribable } from "./subscribable";

export class SceneDocument extends Subscribable {
	private _dirty = false;
	private baseline: SerializedWorld;

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
		this.scene.restore(this.baseline);
		this._dirty = false;
		this.notify();
	}

	toBlob(): Blob {
		return new Blob(
			[exportSceneJson(this.scene, serializeWorld(this.scene.ecs))],
			{ type: "application/json" },
		);
	}

	private capture(): SerializedWorld {
		return serializeWorld(this.scene.ecs);
	}
}
