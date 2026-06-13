import { Camera2D } from "../../engine/camera-2d";
import { Camera2DComponent } from "../../engine/components/camera-2d";
import type { ECS, EntityId } from "../../engine/ecs";
import type { Input } from "../../engine/input/input";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import { EDITOR_CAMERA_ZOOM_STEP } from "../constants";
import type { SpriteEditorState } from "./sprite-editor-state";

export type ViewBounds = Readonly<{ min: Vector2; max: Vector2 }>;

export class SpriteCameraSystem implements UpdateSystem {
	private cameraId: EntityId | null = null;
	private initialized = false;
	private lastDrag: Vector2 | null = null;

	constructor(
		private state: SpriteEditorState,
		private bounds: ViewBounds,
		private padding: number,
	) {}

	update({ ecs, input }: UpdateContext): void {
		const camera = this.ensureCamera(ecs);
		if (!this.initialized && camera.viewportWidth > 0) {
			camera.fitBounds(
				this.bounds.min,
				this.bounds.max,
				this.padding,
			);
			this.initialized = true;
		}
		this.pan(input, camera);
		this.zoom(input, camera);
	}

	private center(): Vector2 {
		return new Vector2(
			(this.bounds.min.x + this.bounds.max.x) / 2,
			(this.bounds.min.y + this.bounds.max.y) / 2,
		);
	}

	private ensureCamera(ecs: ECS): Camera2D {
		if (this.cameraId) {
			const existing = ecs.getComponent(
				this.cameraId,
				Camera2DComponent,
			);
			if (existing) {
				return existing.camera;
			}
		}
		const camera = new Camera2D(this.center(), 1, 1, 64);
		this.cameraId = ecs.createEntity([
			new Camera2DComponent(camera, true, 0),
		]);
		return camera;
	}

	private panActive(input: Input): boolean {
		if (input.mouse.buttons.middle) {
			return true;
		}
		return (
			this.state.tool === "pan" && (input.mouse.buttons.left ?? false)
		);
	}

	private pan(input: Input, camera: Camera2D): void {
		if (!this.panActive(input)) {
			this.lastDrag = null;
			return;
		}
		const current = input.mouse.position;
		if (this.lastDrag) {
			camera.position.x -=
				(current.x - this.lastDrag.x) / camera.zoom;
			camera.position.y -=
				(current.y - this.lastDrag.y) / camera.zoom;
		}
		this.lastDrag = current.clone();
	}

	private zoom(input: Input, camera: Camera2D): void {
		if (input.mouse.wheel.y === 0 || !input.mouse.inside) {
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
