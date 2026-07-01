import { Camera2D } from "../../engine/camera/camera-2d";
import { Camera2DComponent } from "../../engine/camera/camera-2d-component";
import type { ECS, EntityId } from "../../engine/ecs";
import type { Input } from "../../engine/input/input";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import type { TileGrid } from "../../engine/tilemap/grid";
import Vector2 from "../../engine/vector2";
import {
	EDITOR_CAMERA_PRIORITY,
	EDITOR_CAMERA_ZOOM_STEP,
} from "../constants";
import type { EditorState } from "../editor-state";

export class EditorCamera2DSystem implements UpdateSystem {
	private grid: TileGrid | null;
	private editor: EditorState;
	private cameraId: EntityId | null = null;
	private cameraComponent: Camera2DComponent | null = null;
	private lastDragScreen: Vector2 | null = null;

	constructor(grid: TileGrid | null, editor: EditorState) {
		this.grid = grid;
		this.editor = editor;
	}

	update({ ecs, input }: UpdateContext): void {
		const component = this.ensureCamera(ecs);
		this.pan(input, component.camera);
		this.zoom(input, component.camera);
	}

	setActive(active: boolean): void {
		if (this.cameraComponent) {
			this.cameraComponent.active = active;
		}
	}

	ensure(ecs: ECS): void {
		this.ensureCamera(ecs);
	}

	private ensureCamera(ecs: ECS): Camera2DComponent {
		if (this.cameraId) {
			const existing = ecs.getComponent(
				this.cameraId,
				Camera2DComponent,
			);
			if (existing) {
				this.cameraComponent = existing;
				return existing;
			}
		}
		const camera = new Camera2D();
		const bounds = this.grid?.bounds();
		if (bounds) {
			camera.position.set(
				((bounds.minX + bounds.maxX + 1) / 2) * TILE_SIZE,
				((bounds.minY + bounds.maxY + 1) / 2) * TILE_SIZE,
			);
		}
		const component = new Camera2DComponent(
			camera,
			true,
			EDITOR_CAMERA_PRIORITY,
		);
		this.cameraId = ecs.createEntity([component]);
		this.cameraComponent = component;
		return component;
	}

	private panActive(input: Input): boolean {
		if (input.mouse.buttons.middle) {
			return true;
		}
		return this.editor.mode === "pan" && !!input.mouse.buttons.left;
	}

	private pan(input: Input, camera: Camera2D): void {
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
		this.lastDragScreen = current.clone();
	}

	private zoom(input: Input, camera: Camera2D): void {
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
