import { TransformComponent } from "../../engine/components/transform";
import type { EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { pickActiveCamera2D } from "../../engine/systems/camera-2d";
import { TILE_SIZE } from "../../engine/tile";
import Vector2 from "../../engine/vector2";
import type { EditorState } from "../editor-state";
import type { History } from "../history";
import { pickEntityAt } from "../pick";

const snap = (value: number): number =>
	Math.floor(value / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;

export class EntityEditorSystem implements UpdateSystem {
	private store: EditorState;
	private history: History;

	private prevLeft = false;
	private dragging = false;
	private dragEntity: EntityId | null = null;
	private dragStart: Vector2 | null = null;
	private origin: { x: number; y: number } | null = null;

	constructor(store: EditorState, history: History) {
		this.store = store;
		this.history = history;
	}

	update({ ecs, input }: UpdateContext): void {
		const camera = pickActiveCamera2D(ecs);
		if (!camera) {
			return;
		}
		const world = camera.screenToWorld(input.mouse.position);
		if (input.mouse.inside) {
			this.store.setHovered(pickEntityAt(ecs, world));
		}

		if (this.store.mode !== "select") {
			this.dragging = false;
			this.prevLeft = input.mouse.buttons.left ?? false;
			return;
		}

		const left = input.mouse.buttons.left ?? false;
		const pressed = left && !this.prevLeft;
		const released = !left && this.prevLeft;

		if (pressed) {
			const hit = pickEntityAt(ecs, world);
			this.store.setSelected(hit);
			if (hit) {
				const transform = ecs.getComponent(hit, TransformComponent);
				if (transform) {
					this.dragging = true;
					this.dragEntity = hit;
					this.dragStart = world.clone();
					this.origin = {
						x: transform.position.x,
						y: transform.position.y,
					};
				}
			}
		} else if (
			left &&
			this.dragging &&
			this.dragEntity &&
			this.dragStart &&
			this.origin
		) {
			const transform = ecs.getComponent(
				this.dragEntity,
				TransformComponent,
			);
			if (transform) {
				const nx = this.origin.x + (world.x - this.dragStart.x);
				const ny = this.origin.y + (world.y - this.dragStart.y);
				const shift = !!input.keyboard.keys.SHIFT;
				transform.position.x = shift ? snap(nx) : nx;
				transform.position.y = shift ? snap(ny) : ny;
			}
		} else if (released && this.dragging) {
			this.finishDrag(ecs);
		}

		this.prevLeft = left;
	}

	private finishDrag(ecs: UpdateContext["ecs"]): void {
		const id = this.dragEntity;
		const origin = this.origin;
		this.dragging = false;
		this.dragEntity = null;
		this.dragStart = null;
		this.origin = null;
		if (!id || !origin) {
			return;
		}
		const transform = ecs.getComponent(id, TransformComponent);
		if (!transform) {
			return;
		}
		const position = transform.position;
		const after = { x: position.x, y: position.y };
		if (after.x === origin.x && after.y === origin.y) {
			return;
		}
		this.history.push({
			undo: () => {
				position.x = origin.x;
				position.y = origin.y;
			},
			redo: () => {
				position.x = after.x;
				position.y = after.y;
			},
		});
	}
}
