import { Camera2D } from "../../engine/camera/camera-2d";
import type { ECS } from "../../engine/ecs";
import type { DeviceSnapshot } from "../../engine/input/device-snapshot";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { tileBounds } from "../../engine/tilemap/occupancy";
import Vector2 from "../../engine/vector2";
import { EDITOR_CAMERA_ZOOM_STEP } from "../constants";
import type { EditorState } from "../editor-state";

/**
 * Pan/zoom controller for a scene view's editor camera. The camera is
 * plain per-view state (not an ECS entity); this system only mutates it
 * from mouse input each frame.
 */
export class EditorCamera2DSystem implements UpdateSystem {
	private lastDragScreen: Vector2 | null = null;

	constructor(
		private readonly editor: EditorState,
		private readonly camera: Camera2D,
	) {}

	update({ input }: UpdateContext): void {
		this.pan(input, this.camera);
		this.zoom(input, this.camera);
	}

	/** Centre the camera on the scene's tile bounds, if any exist. */
	centerOnContent(ecs: ECS): void {
		const bounds = tileBounds(ecs);
		if (bounds) {
			this.camera.position.set(
				((bounds.minX + bounds.maxX + 1) / 2) * TILE_SIZE,
				((bounds.minY + bounds.maxY + 1) / 2) * TILE_SIZE,
			);
		}
	}

	private panActive(input: DeviceSnapshot): boolean {
		if (input.mouse.buttons.middle) {
			return true;
		}
		return this.editor.mode === "pan" && !!input.mouse.buttons.left;
	}

	private pan(input: DeviceSnapshot, camera: Camera2D): void {
		if (!this.panActive(input)) {
			this.lastDragScreen = null;
			return;
		}
		const current = input.mouse.position;
		if (this.lastDragScreen) {
			camera.position.x -=
				(current.x - this.lastDragScreen.x) / camera.zoom;
			camera.position.y -=
				(current.y - this.lastDragScreen.y) / camera.zoom;
		}
		this.lastDragScreen = new Vector2(current.x, current.y);
	}

	private zoom(input: DeviceSnapshot, camera: Camera2D): void {
		if (input.mouse.wheel.y === 0) {
			return;
		}
		const before = camera.screenToWorld(input.mouse.position);
		camera.zoom *= Math.pow(
			EDITOR_CAMERA_ZOOM_STEP,
			-input.mouse.wheel.y,
		);
		camera.clampZoom();
		const after = camera.screenToWorld(input.mouse.position);
		camera.position.x += before.x - after.x;
		camera.position.y += before.y - after.y;
	}
}
