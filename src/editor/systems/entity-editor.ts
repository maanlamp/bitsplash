import { TransformComponent } from "../../engine/transform-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import type { EntityId, ReadonlyECS } from "../../engine/ecs";
import type AssetManager from "../../engine/assets";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { HALF_TILE_SIZE } from "../../engine/tilemap/tile";
import Vector2 from "../../engine/vector2";
import { duplicateEntities, moveEntities } from "../commands";
import type { EntityMove } from "../commands";
import type { EditorState } from "../editor-state";
import {
	editorSettings,
	type EditorSettings,
} from "../editor-settings";
import { entityAabb, pickEntityAt, type EntityAabb } from "../pick";
import { getPickIndex } from "../pick-index";
import type { SceneDocument } from "../scene-document";
import { snap, type SnapGuide } from "../snapping";

const CLICK_EPSILON = 0.5;

/**
 * Strips floating-point dust from a computed drag coordinate. The raw-drag and
 * snap deltas cancel in exact arithmetic but leave sub-nanometre residue in
 * doubles, so a snapped move would otherwise store `384.0000000001`.
 */
const dedust = (v: number): number => Math.round(v * 1e4) / 1e4;

type Point = Readonly<{ x: number; y: number }>;

type Modifiers = Readonly<{
	shift: boolean;
	ctrl: boolean;
	alt: boolean;
}>;

const readModifiers = (input: UpdateContext["input"]): Modifiers => {
	const m = input.mouse.modifiers;
	const k = input.keyboard.keys;
	return {
		shift: !!(m?.shift || k.SHIFT),
		ctrl: !!(m?.ctrl || k.CTRL),
		alt: !!(m?.alt || k.ALT),
	};
};

const unite = (a: EntityAabb, b: EntityAabb): EntityAabb => ({
	minX: Math.min(a.minX, b.minX),
	minY: Math.min(a.minY, b.minY),
	maxX: Math.max(a.maxX, b.maxX),
	maxY: Math.max(a.maxY, b.maxY),
});

const translate = (
	a: EntityAabb,
	dx: number,
	dy: number,
): EntityAabb => ({
	minX: a.minX + dx,
	minY: a.minY + dy,
	maxX: a.maxX + dx,
	maxY: a.maxY + dy,
});

const rectFrom = (a: Point, b: Point): EntityAabb => ({
	minX: Math.min(a.x, b.x),
	minY: Math.min(a.y, b.y),
	maxX: Math.max(a.x, b.x),
	maxY: Math.max(a.y, b.y),
});

/**
 * The scene-view pointer interaction layer (plan E3): topmost-hit picking,
 * N-entity group drag with grid + smart-guide snapping, intersect marquee
 * box-select, and `Alt`-drag duplicate. Only active in `select` mode.
 *
 * A group drag captures every selected entity's origin, translates the whole
 * set by one delta, snaps the group's union bounds once, and commits a single
 * composite move. Modifier state is read from the live mouse event (robust to a
 * focus-loss blur that clears the keyboard mid-drag, plan E4).
 */
export class EntityEditorSystem implements UpdateSystem {
	private prevLeft = false;
	private gesture: "none" | "drag" | "marquee" = "none";

	private dragOrigins = new Map<EntityId, Point>();
	private dragUnionOrigin: EntityAabb | null = null;
	private dragStart: Vector2 | null = null;
	private guidesValue: ReadonlyArray<SnapGuide> = [];

	private marqueeState: { start: Vector2; current: Vector2 } | null =
		null;
	private marqueeAdditive = false;

	constructor(
		private readonly store: EditorState,
		private readonly document: SceneDocument,
		private readonly settings: EditorSettings = editorSettings,
	) {}

	/** Whether an entity drag gesture is currently in progress. */
	get dragging(): boolean {
		return this.gesture === "drag";
	}

	/** The live smart-guide alignment lines for the current drag (world space). */
	get guides(): ReadonlyArray<SnapGuide> {
		return this.guidesValue;
	}

	/** The live marquee rectangle (world space), or `null` when not marqueeing. */
	get marquee(): EntityAabb | null {
		return this.marqueeState
			? rectFrom(this.marqueeState.start, this.marqueeState.current)
			: null;
	}

	/** Commit any open drag as a journal entry — a save gesture boundary. */
	flush(): void {
		if (this.gesture === "drag") {
			this.finishDrag(this.document.scene.world.ecs);
		}
	}

	update({ ecs, input, assetManager, camera }: UpdateContext): void {
		if (!camera) {
			return;
		}
		const left = input.mouse.buttons.left ?? false;
		if (this.store.mode !== "select") {
			this.reset();
			this.prevLeft = left;
			this.store.setHovered(null);
			return;
		}

		const world = camera.screenToWorld(input.mouse.position);
		if (input.mouse.inside) {
			this.store.setHovered(pickEntityAt(ecs, world, assetManager));
		}

		const pressed = left && !this.prevLeft;
		const released = !left && this.prevLeft;

		if (pressed) {
			this.onPress(ecs, world, input, assetManager);
		} else if (left && this.gesture === "drag") {
			this.updateDrag(ecs, world, input, assetManager);
		} else if (
			left &&
			this.gesture === "marquee" &&
			this.marqueeState
		) {
			this.marqueeState.current = world.clone();
		} else if (released) {
			this.onRelease(ecs, input);
		}

		this.prevLeft = left;
	}

	private onPress(
		ecs: ReadonlyECS,
		world: Vector2,
		input: UpdateContext["input"],
		assetManager?: AssetManager,
	): void {
		const hit = pickEntityAt(ecs, world, assetManager);
		const mods = readModifiers(input);
		if (!hit) {
			this.beginMarquee(world, mods.shift);
			return;
		}
		if (mods.shift) {
			this.store.toggle(hit);
			return;
		}
		if (mods.alt) {
			this.beginAltDrag(ecs, world, hit, assetManager);
			return;
		}
		if (!this.store.has(hit)) {
			this.store.selectOne(hit);
		}
		this.beginDrag(
			ecs,
			world,
			[...this.store.selection.ids],
			assetManager,
		);
	}

	private beginAltDrag(
		ecs: ReadonlyECS,
		world: Vector2,
		hit: EntityId,
		assetManager?: AssetManager,
	): void {
		if (!this.store.has(hit)) {
			this.store.selectOne(hit);
		}
		const copies = duplicateEntities(this.document, [
			...this.store.selection.ids,
		]);
		if (copies.length === 0) {
			return;
		}
		this.store.select(copies);
		this.beginDrag(ecs, world, [...copies], assetManager);
	}

	private beginDrag(
		ecs: ReadonlyECS,
		world: Vector2,
		ids: ReadonlyArray<EntityId>,
		assetManager?: AssetManager,
	): void {
		const origins = new Map<EntityId, Point>();
		let union: EntityAabb | null = null;
		for (const id of ids) {
			const transform = ecs.getComponent(id, TransformComponent);
			if (!transform) {
				continue;
			}
			origins.set(id, {
				x: transform.position.x,
				y: transform.position.y,
			});
			const aabb = entityAabb(ecs, id, assetManager);
			if (aabb) {
				union = union ? unite(union, aabb) : aabb;
			}
		}
		if (origins.size === 0) {
			return;
		}
		this.gesture = "drag";
		this.dragOrigins = origins;
		this.dragUnionOrigin = union;
		this.dragStart = world.clone();
		this.guidesValue = [];
	}

	private updateDrag(
		ecs: ReadonlyECS,
		world: Vector2,
		input: UpdateContext["input"],
		assetManager?: AssetManager,
	): void {
		if (!this.dragStart) {
			return;
		}
		const rawDx = world.x - this.dragStart.x;
		const rawDy = world.y - this.dragStart.y;
		const enabled = !readModifiers(input).ctrl;

		let snapDx = 0;
		let snapDy = 0;
		this.guidesValue = [];
		if (this.dragUnionOrigin) {
			const proposed = translate(this.dragUnionOrigin, rawDx, rawDy);
			const pivot = { x: proposed.minX, y: proposed.minY };
			const result = snap(proposed, pivot, {
				enabled,
				grid: HALF_TILE_SIZE,
				threshold: this.settings.snapThreshold,
				neighbors: this.neighbors(ecs, proposed, assetManager),
			});
			snapDx = result.x - pivot.x;
			snapDy = result.y - pivot.y;
			this.guidesValue = result.guides;
		}

		for (const [id, origin] of this.dragOrigins) {
			const transform = ecs.getComponent(id, TransformComponent);
			if (!transform) {
				continue;
			}
			transform.position.x = dedust(origin.x + rawDx + snapDx);
			transform.position.y = dedust(origin.y + rawDy + snapDy);
			const body = ecs.getComponent(id, PhysicsBodyComponent)?.body;
			if (body) {
				body.setTransform(
					transform.position,
					transform.rotation.radians,
				);
				body.linearVelocity = { x: 0, y: 0 };
				body.setAngularVelocity(0);
			}
			getPickIndex(ecs).markDirty(id);
		}
	}

	private neighbors(
		ecs: ReadonlyECS,
		proposed: EntityAabb,
		assetManager?: AssetManager,
	): ReadonlyArray<EntityAabb> {
		const pad = this.settings.snapThreshold;
		const ids = getPickIndex(ecs).search({
			minX: proposed.minX - pad,
			minY: proposed.minY - pad,
			maxX: proposed.maxX + pad,
			maxY: proposed.maxY + pad,
		});
		const result: EntityAabb[] = [];
		for (const id of ids) {
			if (this.dragOrigins.has(id)) {
				continue;
			}
			const aabb = entityAabb(ecs, id, assetManager);
			if (aabb) {
				result.push(aabb);
			}
		}
		return result;
	}

	private onRelease(
		ecs: ReadonlyECS,
		input: UpdateContext["input"],
	): void {
		if (this.gesture === "drag") {
			this.finishDrag(ecs);
		} else if (this.gesture === "marquee") {
			this.finishMarquee(ecs, input);
		}
	}

	private clearDrag(): void {
		this.gesture = "none";
		this.dragOrigins = new Map();
		this.dragUnionOrigin = null;
		this.dragStart = null;
		this.guidesValue = [];
	}

	private finishDrag(ecs: ReadonlyECS): void {
		const origins = this.dragOrigins;
		this.clearDrag();
		if (origins.size === 0) {
			return;
		}
		const moves: EntityMove[] = [];
		for (const [id, before] of origins) {
			const transform = ecs.getComponent(id, TransformComponent);
			if (!transform) {
				continue;
			}
			moves.push({
				id,
				before,
				after: {
					x: transform.position.x,
					y: transform.position.y,
				},
			});
		}
		moveEntities(this.document, moves);
	}

	private beginMarquee(world: Vector2, additive: boolean): void {
		this.gesture = "marquee";
		this.marqueeState = {
			start: world.clone(),
			current: world.clone(),
		};
		this.marqueeAdditive = additive;
	}

	private finishMarquee(
		ecs: ReadonlyECS,
		input: UpdateContext["input"],
	): void {
		const state = this.marqueeState;
		this.gesture = "none";
		this.marqueeState = null;
		if (!state) {
			return;
		}
		const box = rectFrom(state.start, state.current);
		const dragged =
			box.maxX - box.minX > CLICK_EPSILON ||
			box.maxY - box.minY > CLICK_EPSILON;
		const additive =
			this.marqueeAdditive || readModifiers(input).shift;
		if (!dragged) {
			if (!additive) {
				this.store.clear();
			}
			return;
		}
		const ids = getPickIndex(ecs).search(box);
		if (additive) {
			const set = new Set(this.store.selection.ids);
			for (const id of ids) {
				set.add(id);
			}
			this.store.select([...set]);
		} else {
			this.store.select(ids);
		}
	}

	private reset(): void {
		this.clearDrag();
		this.marqueeState = null;
	}
}
