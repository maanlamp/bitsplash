import { TransformComponent } from "../../engine/transform-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import type { EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import Vector2 from "../../engine/vector2";
import { moveEntity } from "../commands";
import type { EditorState } from "../editor-state";
import type { SceneDocument } from "../scene-document";
import { pickEntityAt } from "../pick";

const snap = (value: number): number =>
	Math.floor(value / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;

export class EntityEditorSystem implements UpdateSystem {
	private store: EditorState;
	private document: SceneDocument;

	private prevLeft = false;
	private dragging = false;
	private dragEntity: EntityId | null = null;
	private dragStart: Vector2 | null = null;
	private origin: { x: number; y: number } | null = null;

	constructor(store: EditorState, document: SceneDocument) {
		this.store = store;
		this.document = document;
	}

	/** Commit any open drag as a journal entry — a save gesture boundary. */
	flush(): void {
		if (this.dragging) {
			this.finishDrag(this.document.scene.world.ecs);
		}
	}

	update({ ecs, input, assetManager, camera }: UpdateContext): void {
		if (!camera) {
			return;
		}
		const world = camera.screenToWorld(input.mouse.position);
		if (input.mouse.inside) {
			this.store.setHovered(pickEntityAt(ecs, world, assetManager));
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
			const hit = pickEntityAt(ecs, world, assetManager);
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
				const body = ecs.getComponent(
					this.dragEntity,
					PhysicsBodyComponent,
				)?.body;
				if (body) {
					body.setTransform(
						transform.position,
						transform.rotation.radians,
					);
					body.linearVelocity = { x: 0, y: 0 };
					body.setAngularVelocity(0);
				}
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
		moveEntity(this.document, id, origin, {
			x: position.x,
			y: position.y,
		});
	}
}
