import { Subscribable } from "./subscribable";

/**
 * The editor's single active-scene pointer (plan A2). It holds the id of the
 * scene whose view currently has focus and is updated event-driven from the
 * workspace's focused view — replacing the per-render "focused winner"
 * derivation the shell used to recompute every render.
 *
 * Downstream, the {@link import("./selection-channel").SelectionChannel} mirrors
 * this pointer's scene selection to the inspector; the analogue of VS Code's
 * `activeEditor` / Theia's active-view pointer feeding a shared selection
 * channel.
 */
export class ActiveScene extends Subscribable {
	private _sceneId: string | null = null;

	get sceneId(): string | null {
		return this._sceneId;
	}

	set(sceneId: string | null): void {
		if (sceneId !== this._sceneId) {
			this._sceneId = sceneId;
			this.notify();
		}
	}
}
